var ChatState = {
	chat: null,
	registeringName: null,
	name: null,
	peername: null,
	
	Callback: function(obj) {
		var msgstr = JSON.stringify(obj);
		// alert('In Callback, received: ' + msgstr);
		var type = obj.messageType;
		if (type == 'REGISTER_SUCCESS') {
			ChatState.SetState_Registered();
		}
		if (type == 'REGISTER_FAILURE') {
			alert('Not registered: ' + obj.text);
		}
		if (type == 'REJECT_UNKNOWN') {
			alert('Unknown callee');
			ChatState.SetStatus('Registered as ' + ChatState.name);
			$('#hangup_btn').addClass('hidden');
		}
		if (type == 'REJECT_ILLEGAL') {
			alert('Illegal call'); // Caller calling themselves
			ChatState.SetStatus('Registered as ' + ChatState.name);
			$('#hangup_btn').addClass('hidden');
		}
		if (type == 'CLOSE') {
			ChatState.SetState_Initial();
			$('#inbound_call').dialog('close');
			alert('Web socket closed');
		}
		if (type == 'INBOUND_CALL') {
			var from = obj.name;
			console.log('Call from ' + from);
			$('#caller_msg').text('Call from ' + from);
			$('#inbound_call').dialog('open');
			ChatState.peername = from;
			$('#hangup_btn').removeClass('hidden');
		}
		if (type == 'ACCEPT') {
			ChatState.SetStatus('In a call with ' + ChatState.peername);
		}
		if (type == 'REJECT') {
			ChatState.SetStatus('Registered as ' + ChatState.name);
			alert('Call rejected');
		}
		if (type == 'INBOUND_MESSAGE') {
			$('#messages').append(obj.text + '<br/>');
		}
		if (type == 'OTHER_HANGUP') {
			ChatState.SetStatus('Registered as ' + ChatState.name);
			alert('Peer hung up');
			$('#inbound_call').dialog('close');
			$('#hangup_btn').addClass('hidden');
		}
	},
	
	SetStatus: function (status) {
		$('#status').text(status);
	},
	
	SetState_Registering: function(name) {
		ChatState.registeringName = name;
	},
	
	SetState_Registered: function() {
		ChatState.name = ChatState.registeringName;
		ChatState.SetStatus('Registered as ' + ChatState.name);
	},
	
	SetState_Initial: function() {
		ChatState.chat = null;
		ChatState.SetStatus('');
	},
	
	OnAccept: function() {
		ChatState.chat.Accept();
		ChatState.SetStatus('In a call with ' + ChatState.peername);
	},
	
	OnReject: function() {
		ChatState.chat.Reject();
	}
	
};

$(function () {
	$('#register_btn').click(function () {
		if (ChatState.chat == null)
			ChatState.chat = new WSChat(ChatState.Callback);
		var name = $('#register_name').val();
		if (name != null && name != '') {
			var res = ChatState.chat.Register('gowebchat.org', 8080, 'websocket/ws', name);
			ChatState.SetState_Registering(name);
		} else {
			alert('Name cannot be empty!');
		}
	});
	
	$('#unregister_btn').click(function () {
		if (ChatState.chat != null) {
			ChatState.chat.Unregister();
			ChatState.SetState_Initial();
		}
	});
	
	$('#call_btn').click(function () {
		name = $('#call_msg').val();
		if (name == null || name == '') {
			console.log('Call: name invalid');
			return;
		}
		if (name == ChatState.name) {
			alert('You can\'t call yourself!');
			return;
		}
		var res = ChatState.chat.Call(name);
		if (!res) {
			alert('Can\'t make a call now');
			return;
		}
		console.log('Calling ' + name);
		ChatState.peername = name;
		$('#hangup_btn').removeClass('hidden');
		ChatState.SetStatus('Calling ' + name);
	});

	$('#inbound_call').dialog({
		autoOpen: false,
		buttons: {
			'Accept': function () {
					console.log('You pressed Accept');
					$('#inbound_call').dialog('close');
					ChatState.OnAccept();
				},
			'Reject': function () {
					console.log('You pressed Reject');
					$('#inbound_call').dialog('close');
					ChatState.OnReject();
				}
		}
	});
	
	$('#message_box').dialog({
		autoOpen: false,
		title: ''
	});
	
	$('#send_btn').click(function () {
		var messageStr = $('#message_output').val();
		ChatState.chat.SendText(messageStr);
		$('#messages').append('<span class="outgoing">' + messageStr + '</span><br/>');
	});
	
	$('#hangup_btn').click(function () {
		if (ChatState.chat == null) {
			console.log('Error hanging up');
			return;
		}
		ChatState.chat.HangUp();
		ChatState.SetStatus('Registered as ' + ChatState.name);
	});
	
});

