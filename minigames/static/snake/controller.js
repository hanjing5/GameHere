var socket;
var name;
$(document).ready(function(){
    name = prompt("What is your name?", "anonymous");

    // start the socket.io connection and set up the handlers
    socket = io.connect('http://' + window.location.host);
    socket.on('connect', function(){
        $('div#message').html('Controller connected to server');
        socket.emit('newPlayer', {title: 'Snake', name: name});
    });
    socket.on('playerConnected', function(data){
        if(data.error){
            $('div#message').html('Error: ' + data.error);
            socket.disconnect();
        }else{
            $('div#message').html(data.title + ' controller connected to display as player ' + name);
        }
    });
});
$(document).keypress(function(event) {
    var deltaY = 0;
    var deltaX = 0;
	console.log(event.keyCode)
    switch(parseInt(event.keyCode)){
        case 37: //left arrow
		case 97:
            deltaX = -1;
            break;
        case 38: //up arrow
		case 119:
            deltaY = -1;
            break;
        case 39: //right arrow
		case 100:
            deltaX = 1;
            break;
        case 40: //down arrow
		case 115:
            deltaY = 1;
            break;
        case 0:
            if(event.charCode == 112) socket.emit('pause');
            break;
        default:
            return;
    }
    if(deltaY != 0 || deltaX != 0){
        socket.emit('move', {x: deltaX, y: deltaY});
    }
});