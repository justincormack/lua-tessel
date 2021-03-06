/**
 * @fileOverview Abstract transport class.
 * A transport is a means of communicating with a Tessel device.
 * @author <a href="mailto:lua-tessel@paulcuth.me.uk">Paul Cuthbertson</a>
 */


var // External dependencies
	usb = require('usb'),
	Promise = require('es6-promise').Promise,

	// Local dependencies
	Connection = require('../connection/Connection'),
	AbstractTransport = require('./AbstractTransport'),

	// Constannts
	TESSEL_VID = 0x1d50,
	TESSEL_PID = 0x6097,

	VENDOR_REQ_OUT = usb.LIBUSB_REQUEST_TYPE_VENDOR | usb.LIBUSB_RECIPIENT_DEVICE | usb.LIBUSB_ENDPOINT_OUT,
	VENDOR_REQ_IN  = usb.LIBUSB_REQUEST_TYPE_VENDOR | usb.LIBUSB_RECIPIENT_DEVICE | usb.LIBUSB_ENDPOINT_IN,

	TRANSFER_SIZE = 4096,

	POST_MESSAGE = {},
	CONTROL_TRANSFER = {},

	TAG_METHOD_MAP = {};


// Init constant map
TAG_METHOD_MAP[Connection.TAG_KILL] = { method: CONTROL_TRANSFER, direction: VENDOR_REQ_OUT };
TAG_METHOD_MAP[Connection.TAG_FLASH] = { method: POST_MESSAGE };
TAG_METHOD_MAP[Connection.TAG_RUN] = { method: POST_MESSAGE };




/**
 * USB transport layer.
 * @constructor
 * @extends AbstractTransport
 */
function USBTransport (config) {
	this._device = null;
	this.deviceSerial = null;
	this._endpoints = {};
}


USBTransport.prototype = Object.create(AbstractTransport.prototype);
USBTransport.prototype.constructor = USBTransport;




/**
 * Returns an array of connected Tessel devices.
 * @static
 * @returns {Array<Object>} Array of device objects.
 */
USBTransport.getDevices = function () {
	return usb.getDeviceList().filter(function (device) {
		if (
			device.deviceDescriptor.idVendor == TESSEL_VID 
			&& device.deviceDescriptor.idProduct == TESSEL_PID
			&& device.deviceDescriptor.bcdDevice >> 8 != 0 	// Exclude devices in bootloader mode
		) {
			return device;
		}
	});
};




/**
 * Returns the first Tessel device found.
 * @static
 * @returns {Object|undefined} A device object, if a device is present.
 */
USBTransport.getFirstDevice = function () {
	var devices = this.getDevices();
	if (!devices.length) throw new Error('No Tessel devices found');

	return devices[0];
};





/**
 * Initialises the USB transport layer.
 */
USBTransport.prototype.init = function () {
	var _this = this;

	this._closeListener = this.close.bind(this);

	return new Promise(function (resolve, reject) {
		try {
			_this._device = _this.constructor.getFirstDevice();
		} catch (e) {
			reject(e);
		}

		_this._device.open();
		_this._device.timeout = 10000;

		resolve(
			Promise.all([
				_this._getDeviceSerial(), 
				_this._getDeviceInterface()
			])
			.then(function (serial) { 
				setImmediate(_this.emit.bind(_this, 'debug', 'Connected to device ' + serial));
				return _this; 
			})
		);

	});
};




/**
 * Retrieves the serial number of the connected Tessel device.
 * @returns {Promise<string|Error>} A promise to return the device's serial number.
 */
USBTransport.prototype._getDeviceSerial = function () {
	var _this = this,
		device = this._device;

	return new Promise(function (resolve, reject) {
		device.getStringDescriptor(device.deviceDescriptor.iSerialNumber, function (err, serialNumber) {
			if (err) return reject(err);
			resolve(_this.deviceSerial = serialNumber);
		});
	});
};




/**
 * Sets up the USB interface.
 * @returns {Promise<Error>} A promise to set up the interface.
 */
 USBTransport.prototype._getDeviceInterface = function () {
	var _this = this,
		device = this._device,
		endpoints = this._endpoints;

	return new Promise(function (resolve, reject) {
		var interface = _this._interface = device.interface(0);

		try {
			interface.claim();
		} catch (e) {
			if (e.message === 'LIBUSB_ERROR_BUSY') reject(new Error('Device is in use by another process'));
			reject(e);
		}

		interface.setAltSetting(1, function (err) {
			if (err) reject(err);

			endpoints.log = interface.endpoints[0];
			endpoints.messagesIn = interface.endpoints[1];
			endpoints.messagesOut = interface.endpoints[2];
			
			_this._initEndpoints();
			resolve();
		});
	});
};




/**
 * Initialises all the endpoints in the interface.
 * @returns {Promise} A promise to initialise the interfaces.
 */
 USBTransport.prototype._initEndpoints = function () {
	return Promise.all([
		this._initLogEndpoint(), 
		this._initMessageInEndpoint(), 
		this._initMessageOutEndpoint()
	]);
};




/**
 * Initialises the logging endpoint in the interface.
 * @returns {Promise} A promise to initialise the interface.
 */
USBTransport.prototype._initLogEndpoint = function () {
	var _this = this,
		endpoint = this._endpoints.log;

	endpoint.startStream(4, TRANSFER_SIZE);
	
	endpoint.on('data', function (data) {
		var pos = 0,
			logLevel, message,
			i, l;
		
		while (pos < data.length) {
			if (data[pos] !== 1) throw new Error('Expected STX at ' + pos + ', got ' + data[pos] + 'instead');
			logLevel = data[pos + 1];

			for (var i = pos + 2, l = data.length; i < l; i++) {
				if (data[i] === 1) break;
			}

			message = data.toString('utf8', pos + 2, i);
			_this.emit('debug', message, logLevel);

			pos = i;
		}
	});

	endpoint.on('error', function (e) {
		throw new Error('Error reading USB log endpoint: ' + e.message);
	});
};




/**
 * Initialises the incoming message endpoint in the interface.
 * @returns {Promise} A promise to initialise the interface.
 */
USBTransport.prototype._initMessageInEndpoint = function () {
	var _this = this,
		endpoint = this._endpoints.messagesIn,
		buffers = [];

	
	endpoint.startStream(2, TRANSFER_SIZE);

	endpoint.on('data', function (data) {
		var buffer, tag, length;

		buffers.push(data);

		if (data.length < TRANSFER_SIZE) {
			buffer = Buffer.concat(buffers);

			if (buffer.length > 0) {
				length = buffer.readUInt32LE(0);
				tag = buffer.readUInt32LE(4);
				buffer = buffer.slice(8);
				_this.emit('message', tag, buffer);
			}

			buffers.length = 0;

		} else if (buffers.length * TRANSFER_SIZE > 32 * 1024 * 1024) {
			// The message wouldn't fit in Tessel's memory. It probably didn't mean to send this...
			throw new Error("Malformed message (oversize): " + buffers[0].toString('hex', 0, 8))
		}
	});

	endpoint.on('error', function (e) {
		throw new Error('Error reading USB message endpoint: ' + e.message);
	});
};




/**
 * Initialises the outgoing message endpoint in the interface.
 * @returns {Promise} A promise to initialise the interface.
 */
USBTransport.prototype._initMessageOutEndpoint = function () {
	// todo
};




/**
 * Sends data over the transport layer.
 * @param {number} tag Unique reference to the type of message.
 * @param {Buffer} data Data to send.
 * @returns {Promise<Buffer|Error>} A promise to return data in the response.
 */
USBTransport.prototype.send = function (tag, data) {
	var tagData = TAG_METHOD_MAP[tag];

	if (tagData.method === POST_MESSAGE) return this._postMessage(tag, data);
	return this._controlTransfer(tagData.direction, tag, data);
};




/**
 * Sends data via the message interface.
 * @param {number} tag Unique reference to the type of message.
 * @param {Buffer} data Data to send.
 * @returns {Promise<Buffer|Error>} A promise to return data in the reply.
 */
USBTransport.prototype._postMessage = function (tag, data) {
	var _this = this,
		header = new Buffer(8),
		payload;

	data = data || new Buffer(0);

	header.writeUInt32LE(data.length, 0);
	header.writeUInt32LE(tag, 4);

	payload = Buffer.concat([header, data]);

	return new Promise(function (resolve, reject) {

		_this._endpoints.messagesOut.transferWithZLP(payload, function (err) {
			if (err) reject(err);
			resolve();
		});
	});
};




/**
 * Sends data via control transfer.
 * @param {number} direction Identifier for the direction of the message.
 * @param {number} tag Unique reference to the type of message.
 * @param {Buffer} data Data to send.
 * @returns {Promise<Buffer|Error>} A promise to return data in the reply.
 */
USBTransport.prototype._controlTransfer = function (direction, tag, data) {
	var _this = this;

	return new Promise(function (resolve, reject) {
		_this._device.controlTransfer(direction, tag, 0, 0, data, function(err, data) {
			if (err) reject(err);
			resolve(data);
		});
	});
};




/**
 * Ends communication through the transport layer.
 * @returns {Promise<Error>} A promise to close the connection.
 */
USBTransport.prototype.close = function () {
	var _this = this;

	return new Promise(function (resolve) {
		if (!_this._interface) resolve();

		_this._interface.release(true, function (err) {
		if (_this._device) _this._device.close();
			_this._interface = null;
			resolve();
		});

	});
};




module.exports = USBTransport;
