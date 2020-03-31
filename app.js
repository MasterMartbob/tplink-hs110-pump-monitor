require('dotenv').config()
const powerThreshold = process.env.POWER_THRESHOLD;
const aliasDevice = process.env.ALIAS_DEVICE;
const userTpLink = process.env.USER_TPLINK;
const passTpLink = process.env.PASS_TPLINK;
const emailSender = process.env.EMAIL_SENDER;
const passEmailSender = process.env.PASS_EMAIL_SENDER;
const emailReceiver = process.env.EMAIL_RECEIVER;
const waitBetweenRead = process.env.WAIT_BETWEEN_READ;
const logFileName = process.env.LOG_FILENAME;
const idleThreshold = process.env.IDLE_THRESHOLD;
const repeatAlertEvery = process.env.REPEAT_ALERT_EVERY;
const deviceRunningTimeThreshold = process.env.DEVICE_RUNNING_TIME_THRESHOLD;

//Init logger
var log4js = require('log4js');
log4js.configure({
  appenders: {
    out: { type: 'console' }, 
    info: { type: 'file', filename: './' + logFileName + '.log' },
    debug: { type: 'file', filename: './' + logFileName + '_debug.log' }
  },
  categories: {
    default: { appenders: ['out','info'], level: 'info' },
    debug: { appenders: ['out','debug'], level: 'info' }
  }
  });    
const logger = log4js.getLogger('default'); 
const loggerDebug = log4js.getLogger('debug'); 

//Init nodemailer
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailSender,
      pass: passEmailSender
    }
  });  

var monitoredDevice = {
  started: false,
  lastStartedTime: undefined,
  lastTimeInactivityAlert: undefined,
  lastTimeRunningAlert: undefined,
  usage: undefined,
  init: function() {
    this.started = false;
    this.lastStartedTime = getDate();
    this.lastTimeInactivityAlert = getDate();
    this.lastTimeRunningAlert = getDate();
    this.usage = undefined;
  },
  isDeviceStarted: function() { return this.status; },
  isDeviceStopped: function() { return !this.status; },
  startDevice: function() { 
    this.status = true;
    logger.info(aliasDevice + " Started");
    sendEmail(aliasDevice + " Started");
    this.lastStartedTime = getDate();  
  },
  stopDevice: function() {
    this.started = false;
    logger.info(aliasDevice + " Stopped");
    sendEmail(aliasDevice + " stopped");
  }   
}

async function main() {          
    const { login } = require("tplink-cloud-api");    

    loggerDebug.info("-----Monitoring started!-----");
    monitoredDevice.init();
        
    try {
      var tplink = await login(userTpLink, passTpLink)
      await tplink.getDeviceList();
    }
    catch (err) {
      loggerDebug.info(err); 
      return;
    } 
      
    while (true) {
      try {
        var device = tplink.getHS110(aliasDevice);
      }  
      catch(err) {
        loggerDebug.info(aliasDevice + " " + err);
        break;
      }
    
      try {
        monitoredDevice.usage = await device.getPowerUsage();
        
        loggerDebug.info(JSON.stringify(monitoredDevice.usage));
        verifyStartStop();
        verifyLastTimeStarted();
        verifyRunningTime();
        
        await sleep(waitBetweenRead);  
      }
      catch (err) {
        loggerDebug.info(err);
        break; 
      }      
    }    
}

function verifyLastTimeStarted() {  
  if (getDate() - monitoredDevice.lastTimeInactivityAlert >= repeatAlertEvery &&
   getDate() - monitoredDevice.lastStartedTime >= idleThreshold) {      
    sendEmail(aliasDevice + " didn't start for the last " + (getDate() - monitoredDevice.lastStartedTime)/60 + " minutes");    
    monitoredDevice.lastTimeInactivityAlert = getDate();
  }
}

function verifyStartStop() {
  let power = ('power' in monitoredDevice.usage ? monitoredDevice.usage.power : monitoredDevice.usage.power_mw);  
  if (power > powerThreshold) {            
    if (monitoredDevice.isDeviceStopped()) {
        monitoredDevice.startDevice();        
    }
  }
  else if (monitoredDevice.isDeviceStarted()) {    
      monitoredDevice.stopDevice();
  }
}

function verifyRunningTime() {
  if (getDate() - monitoredDevice.lastTimeRunningAlert >= repeatAlertEvery &&
    monitoredDevice.isDeviceStarted && getDate() - monitoredDevice.lastStartedTime >= deviceRunningTimeThreshold) {
    sendEmail(aliasDevice + " running for more then " + (getDate() - monitoredDevice.lastStartedTime)/60 + " minutes");    
    monitoredDevice.lastTimeRunningAlert = getDate();
  }
}

function getDate() {
  return Date.now()/1000;
}

function sleep(s) {
    return new Promise(resolve => setTimeout(resolve, s*1000), rejected => {});
}

function readLogFile() {
  var fs = require('fs');

  return new Promise(function(resolve, reject) {
    fs.readFile(logFileName + '.log', 'utf8', function(err, data) {
        if(err) { 
            reject(err);  
        }
        else {              
            resolve(data);
        }
      });
  });
}
  
async function sendEmail(message) {

  let dataLog = await readLogFile()  
  .then(data => {
    return data;
  })
  .catch(err => {
    throw(err);
  });  

  var mailOptions = {
      from: emailSender,
      to: emailReceiver,
      subject: message,
      text: dataLog
    };
  transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        loggerDebug.info(error);
      } else {
        loggerDebug.info(message + ' Email sent: ' + info.response);
      }
    });
}

main();