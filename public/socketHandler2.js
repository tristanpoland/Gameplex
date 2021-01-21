function SignalingServer() {
    this.socket = io.connect();

    this.socket.on('requestOffer', function() {
        console.log('received "requestOffer"');
        onRequestOffer();
    });

    this.socket.on('invite', function(sdp) {
        console.log('received "invite":', sdp);
        onOfferReceived(sdp);
    });

    this.socket.on('OK', function(sdp) {
        console.log('received sdp answer:', sdp);
        onAnswerReceived(sdp);
    });

    this.socket.on('candidate', function(cand) {
        console.log('received "candidate"', cand);
        addRemoteCandidate(cand);
    });

    this.socket.on('bye', function() {
        console.log('received bye');
        stopCommunication();
        //alert('The other peer say BYE');
    });

    this.socket.on('error', function(error) {
        switch (error) {
            case 'full room':
                alert('full room');
                stopCommunication();
                break;
            default:
                alert('Uncaught error:', error)
        }
        alert(error);
    });
}

SignalingServer.prototype.joinRoom = function(roomName) {
    if (!this.socket) throw 'Signaling server closed!!!';
    this.socket.emit('join', {'room': roomName});
};

SignalingServer.prototype.sendCandidate = function(cand) {
    if (!this.socket) throw 'Signaling server closed!!!';
    this.socket.emit('candidate', cand);
};

SignalingServer.prototype.sendOffer = function(sdpOffer) {
    if (!this.socket) throw 'Signaling server closed!!!';
    this.socket.emit('invite', sdpOffer);
}

SignalingServer.prototype.sendAnswer = function(sdpAnswer) {
    if (!this.socket) throw 'Signaling server closed!!!';
    this.socket.emit('OK', sdpAnswer);
};

SignalingServer.prototype.sendBye = function(sdpAnswer) {
    if (!this.socket) throw 'Signaling server closed!!!';
    this.socket.emit('bye');
    console.log('say bye')
};

$(document).ready(function() {
    window.Signaling = new SignalingServer();

    $('#joinButton').click(function() {
        var roomName = $('#roomName').val();
        if (roomName == '') {
            alert('Write a room name!');
            return;
        }
        window.Signaling.joinRoom(roomName);
        $('#roomName').prop('disabled', true);
        $('#joinButton').prop('disabled', true);
        $('#stopButton').prop('disabled', false);
        getUserMedia();
    });

    $('#stopButton').click(function() {
        stopCommunication();
        $('#roomName').prop('disabled', false);
        $('#joinButton').prop('disabled', false);
        $('#stopButton').prop('disabled', true);
    });
});
