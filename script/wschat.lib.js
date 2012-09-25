// alert('wschat.lib.js');

function WSChat(fn) {
	this.ws = null; // web socket
	this.port = null;
	this.host = '';
	this.url = '';
	this.service = '';
	this.state = WSChat.STATE_INITIAL;
	this.registrationName = ''; // name under which we are trying to register
	this.myname = '';
	this.peername = '';
	this.callback = fn;
}

// States
WSChat.STATE_INITIAL = 0;
WSChat.STATE_OPENING_WEBSOCKET = 1;
WSChat.STATE_REGISTERING = 2;
WSChat.STATE_REGISTERED = 3;
WSChat.STATE_CALLING = 4;
WSChat.STATE_INBOUND_CALL = 5;
WSChat.STATE_IN_CALL = 6;

// Messages
WSChat.MSG_REGISTER = 'REGISTER';
WSChat.MSG_UNREGISTER = 'UNREGISTER';
WSChat.MSG_CLOSE = 'CLOSE';

WSChat.prototype.show = function () {
	alert('show');
};

WSChat.prototype.Register = function(host, port, resource, name) {
	if (this.state != WSChat.STATE_INITIAL) {
		console.log('Error: trying to register in wrong state (' + this.state + ')');
		return false;
	}
	this.host = host;
	this.port = port;
	this.url = 'ws://' + host + ':' + port;
	this.service = this.url  + '/' + resource;

	var ws = new WebSocket(this.service);
	if (ws == null) {
		console.log('WebSocket creation failed');
		return false;
	}
	console.log('WebSocket creation succeeded');

	this.ws = ws;
	var thisObj = this;

	ws.onopen = function(event) {
		thisObj.OnOpen(event);
	};
	
	ws.onerror = function(event) {
		thisObj.OnError(event);
	}
	
	ws.onmessage = function(event) {
		thisObj.OnMessage(event);
	}
	
	ws.onclose = function(event) {
		thisObj.OnClose(event);
	}

	this.state = WSChat.STATE_OPENING_WEBSOCKET;
	this.myname = name;
	return true;
}

WSChat.prototype.OnOpen = function(event) {
	console.log('OnOpen');
	console.log(' State is ' + this.state);
	if (this.state == WSChat.STATE_OPENING_WEBSOCKET) {
		var message = {
			type: WSChat.MSG_REGISTER,
			name: this.myname
		};
		this.Send(message);
		this.state = WSChat.STATE_REGISTERING;
	} else {
		console.log('WSChat.OnOpen: wrong state (' + this.state + ')');
	}
}

WSChat.prototype.OnError = function(event) {
	console.log('OnError');
}

WSChat.prototype.OnMessage = function(event) {
	console.log('OnMessage: ' + event.data);
	var msgObj = $.parseJSON(event.data);
	switch (this.state) {
		case WSChat.STATE_REGISTERING:
			if (msgObj.messageType == 'REGISTER_SUCCESS') {
				console.log('Registered!');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_REGISTERED;
			} else {
				console.log('Not registered!');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_INITIAL;
			}
			break;
		case WSChat.STATE_REGISTERED:
			if (msgObj.messageType == 'INBOUND_CALL') {
				console.log('Inbound call');
				if (this.callback != null) {
					this.callback(msgObj);
					this.state = WSChat.STATE_INBOUND_CALL;
				}
			}
			break;
		case WSChat.STATE_INBOUND_CALL:
			if (msgObj.messageType == 'OTHER_HANGUP') {
				console.log('The caller hung up');
				if (this.callback != null) {
					this.callback(msgObj);
					this.state = WSChat.STATE_REGISTERED;
				}
			}
			break;
		case WSChat.STATE_CALLING:
			if (msgObj.messageType == 'ACCEPT') {
				console.log('Call accepted');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_IN_CALL;
			} else if (msgObj.messageType == 'REJECT') {
				console.log('Call rejected');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_REGISTERED;
			} else if (msgObj.messageType == 'REJECT_UNKNOWN') {
				console.log('Call rejected: unknown callee');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_REGISTERED;
			} else if (msgObj.messageType == 'REJECT_ILLEGAL') {
				console.log('Call rejected: illegal call');
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_REGISTERED;
			}
			break;
		case WSChat.STATE_IN_CALL:
			if (msgObj.messageType == 'INBOUND_MESSAGE') {
				var text = msgObj.text;
				if ((text != null) && (this.callback != null)) {
					this.callback(msgObj);
				}
			} else if (msgObj.messageType == 'OTHER_HANGUP') {
				if (this.callback != null) {
					this.callback(msgObj);
				}
				this.state = WSChat.STATE_REGISTERED;
			}
			break;
	}
}

WSChat.prototype.OnClose = function(event) {
	console.log('OnClose');
	msgObj = {
		messageType: WSChat.MSG_CLOSE,
	};
	if (this.callback != null) {
		this.callback(msgObj);
	}
	this.callback = null;
	this.state = WSChat.STATE_INITIAL;
}

WSChat.prototype.Send = function(message) {
	if (this.ws != null) {
		var msgstr = JSON.stringify(message);
		console.log('Send(' + msgstr + ')');
		this.ws.send(msgstr);
	} else {
		console.log('Send: ws is null');
	}
}

WSChat.prototype.Call = function(name) {
	if (this.state != WSChat.STATE_REGISTERED) {
		console.log('Calling ' + name + ' from wrong state (' + this.state + ')');
		return false;
	}
	var message = {
		type: 'CALL',
		name: name
	};
	var msgstr = JSON.stringify(message);
	this.ws.send(msgstr);
	this.peername = name;
	this.state = WSChat.STATE_CALLING;
	return true;
}

WSChat.prototype.Accept = function() {
	if (this.state != WSChat.STATE_INBOUND_CALL) {
		console.log('Accept called in wrong state (' + this.state + ')');
		return;
	}
	var message = {
		type: 'ACCEPT'
	};
	var msgstr = JSON.stringify(message);
	this.ws.send(msgstr);
	this.state = WSChat.STATE_IN_CALL;
}

WSChat.prototype.Reject = function() {
	if (this.state != WSChat.STATE_INBOUND_CALL) {
		console.log('Reject called in wrong state (' + this.state + ')');
		return;
	}
	var message = {
		type: 'REJECT'
	};
	var msgstr = JSON.stringify(message);
	this.ws.send(msgstr);
	this.state = WSChat.STATE_REGISTERED;
}

WSChat.prototype.SendText = function(msg) {
	if (this.state != WSChat.STATE_IN_CALL) {
		console.log('Error: trying to send text message in wrong state (' + this.state + ')');
		return false;
	}
	var message = {
		type: 'MESSAGE',
		text: msg
	};
	var msgstr = JSON.stringify(message);
	this.ws.send(msgstr);
}

WSChat.prototype.HangUp = function() {
	if ((this.state == WSChat.STATE_REGISTERED) || (this.state == WSChat.STATE_CALLING) ||
		(this.state == WSChat.INBOUND_CALL) || (this.state == WSChat.STATE_IN_CALL)) {
	
		var message = {
			type: 'HANGUP'
		};
		var msgstr = JSON.stringify(message);
		console.log('HangUp: sending message ', msgstr);
		this.ws.send(msgstr);
		this.state = WSChat.STATE_REGISTERED;
	}
}

WSChat.prototype.Unregister = function() {
	if (this.state != WSChat.STATE_REGISTERED) {
		console.log('Error: trying to unregister in wrong state (' + this.state + ')');
		return false;
	}
	var message = {
		type: WSChat.MSG_UNREGISTER
	};
	this.Send(message);
	this.state = WSChat.STATE_INITIAL;
}

