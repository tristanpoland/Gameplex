var VideoLocal = $('#videoLocal')[0];
var VideoRemote = $('#videoRemote')[0];
var Constraints = {
    audio: true,
    video: true
};
var RTCPeerConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }, {
        'urls': 'stun:stun1.l.google.com:19302'
    }]
}

var LocalStream;
var RemoteStream;
var LocalPC;
var LocalDC;
var RemoteDC;
var MyNumber = null;
var HisNumber = null;

var Started = false; // When localStream added to LocalPC
var FirstPeer = false;

function getUserMedia() {
    navigator.mediaDevices.getUserMedia(Constraints)
    .then(function(stream) {
        LocalStream = stream;
        VideoLocal.srcObject = stream;
        if (LocalPC && !Started) {
            Started = true;
            LocalPC.addStream(LocalStream);
            if (FirstPeer)
                createAndSendOffer();
            else
                createAndSendAnswer();
        }
    })
    .catch(function(error) {
        alert('Get user media error: ' + error.name);
        console.log(error);
    });
}

function addRemoteCandidate(candidate) {
    LocalPC.addIceCandidate(
        new RTCIceCandidate(candidate)
    );
}

function onLocalIceCandidate(ev) {
    console.log('candidate');
    if (ev.candidate) {
        window.Signaling.sendCandidate(ev.candidate);
    } else {
        console.log('No more candidates');
    }
}

function onAddStream(ev) {
    VideoRemote.srcObject = ev.stream;
    RemoteStream = ev.stream;
}

function prepareLocalConnection() {
    LocalPC = new RTCPeerConnection(RTCPeerConfig);
    console.log('BEGIN LOCAL PC')
    LocalDC = LocalPC.createDataChannel(null);
    LocalDC.onopen = onOpenDataChannelLocal;
    LocalDC.onclose = onCloseDataChannelLocal;
    LocalPC.ondatachannel = onDataChannelCreated
    LocalPC.onicecandidate = onLocalIceCandidate;
    LocalPC.onaddstream = onAddStream;
}

function onRequestOffer() {
    FirstPeer = true;
    prepareLocalConnection();
    if (LocalStream && !Started) {
        Started = true;
        LocalPC.addStream(LocalStream);
        createAndSendOffer();
    }
}

function createAndSendOffer() {
    LocalPC.createOffer({})
    .then(function(sdpOffer) {
        console.log('Offer:', sdpOffer);
        LocalPC.setLocalDescription(sdpOffer)
        .then(function() {
            window.Signaling.sendOffer(sdpOffer);
        })
        .catch(function(error) {
            console.error('Error creating offer:', error);
        });
    });
}

function onOfferReceived(sdpOffer) {
    FirstPeer = false;
    prepareLocalConnection();
    LocalPC.setRemoteDescription(sdpOffer)
    .then(function() {
        if (LocalStream && !Started) {
            Started = true;
            LocalPC.addStream(LocalStream);
            createAndSendAnswer();
        }
    })
    .catch(function(error) {
        console.error('Error creating answer:', error);
    });
}

function createAndSendAnswer() {
    LocalPC.createAnswer()
    .then(function(sdpAnswer) {
        console.log('Answer:', sdpAnswer);
        LocalPC.setLocalDescription(sdpAnswer)
        .then(function() {
            window.Signaling.sendAnswer(sdpAnswer);
        });
    });
}

function onAnswerReceived(sdpAnswer) {
    LocalPC.setRemoteDescription(sdpAnswer);
}

function onOpenDataChannelLocal() {
    console.log('Data Channel open');
    $('#sendText').prop('disabled', false);
    $('#sendText').click(sendMessage);
    $('#localText').keyup(function(ev) {
        if (ev.which == 13) {
            sendMessage();
            ev.preventDefault();
        }
    });
}

function sendMessage() {
    var msg = $('#localText').val();
    $('#localText').val('');
    if (msg.trim() != "") {
        LocalDC.send(JSON.stringify({
            'type': 'chat_message',
            'content': msg
        }));
        $('#chat').append('<div><strong>Me:</strong> ' + msg + '</div>');
        $('#chat').scrollTop($('#chat').prop('scrollHeight'));
    }
}

function checkMasterPong() {
    if (HisNumber !== null && HisNumber !== null){
        if (MyNumber > HisNumber){ //I'm the master
            window.masterPong = true;
            //Wait until GO!
        } else if (MyNumber === HisNumber) {
            HisNumber = null;
            MyNumber = null;
            sendBeginGame();//again
        } else {
            LocalDC.send(JSON.stringify({
                'type': 'GO!',
            }));
            window.masterPong = false;
            window.pongStarted = true;
            newIntervalGo(10);
        }
    }
}

function sendBeginGame() {
    MyNumber = parseInt(Math.random()*10e8);
    LocalDC.send(JSON.stringify({
        'type': 'begin_game',
        'number': MyNumber
    }));
    checkMasterPong();
}

function onCloseDataChannelLocal() {
    $('#sendText').prop('disabled', true);
    $('#chat').empty();
    $('#sendText').unbind('click');
    $('#localText').unbind('keyup');
}

function onDataChannelCreated(ev) {
    RemoteDC = ev.channel;
    RemoteDC.onmessage = onMessageReceived;
    sendBeginGame();
}

function onMessageReceived(ev) {
    var msg = JSON.parse(ev.data);
    if (msg.type === 'chat_message') {
        $('#chat').append('<div><strong>Other:</strong> ' + msg.content + '</div>');
        $('#chat').scrollTop($('#chat').prop('scrollHeight'));
    } else if (msg.type === 'game_status'){
        updateStatusPong(msg); // in pong file
    } else if (msg.type === 'begin_game') {
        HisNumber = msg.number;
        checkMasterPong();
    } else if (msg.type === 'GO!') {
        window.pongStarted = true;
        newIntervalGo(10);
    } else if (msg.type === 'update_score') {
        updateScore(msg);
    } else {
        console.error("Not defined type", msg.type);
    }

}

function stopCommunication() {
    window.Signaling.sendBye();
    stopWebGl();
    if (LocalStream) {
        LocalStream.getTracks().forEach(function(track) {
            track.stop();
        });
        LocalStream = null;
    }
    if (RemoteStream) {
        RemoteStream.getTracks().forEach(function(track) {
            track.stop();
        });
        RemoteStream = null;
    }
    if (LocalPC) {
        LocalPC.close();
        LocalPC = null;
    }
    if (LocalDC) LocalDC = null;
    if (RemoteDC) RemoteDC = null;
    Started = false;
    FirstPeer = false;
    VideoLocal.srcObject = null;
    VideoRemote.srcObject = null;
    $('#roomName').prop('disabled', false);
    $('#joinButton').prop('disabled', false);
    $('#byeButton').prop('disabled', true);
}
