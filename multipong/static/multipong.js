// The Player object constructor
function Player(name, color, game){

    // state variables

    this.name = name;
    this.x = 0;         // the x and y position in the game, each in [0, 1], starting from the top left
    this.y = 0;
    this.position = 0;  // the position of the player on the field, a positive or negative nonzero integer
    this.color = color;

    // motion function based on an input of 1 or -1
    // move the paddle up or down unless we are at the edge of the field
    this.move = function(motion){
        if((motion.y == -1 && this.y >= game.moveDistance) ||
           (motion.y == 1 && this.y <= 1 - game.moveDistance - game.paddleWidth)){
            this.y += game.moveDistance * motion.y;
            // not sure why I put this here. I think it was intended to avoid numerical issues,
            // but it seems like an unnecessary loss of precision. TODO: investigate
            this.y = Math.round(this.y*100)/100;
        }
    }
}

// The Multipong game constructor
function Multipong(){

    // constants, all in terms of a 1x1 field

    this.title = 'Multipong';
    this.paddleWidth = .2;
    this.paddleThickness = .03;
    this.ballRadius = .02;
    this.moveDistance = .1;

    // state variables, all in terms of a 1x1 field

    this.availableColors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF"];
    this.started = false;
    this.leftPlayers = [];
    this.rightPlayers = [];
    this.leftScore = 0;
    this.rightScore = 0;
    this.ballLocationX = .5;
    this.ballLocationY = .5;
    this.ballSpeed = 0;
    // an angle in radians. NOTE: the angle is in the counterclockwise was from horizontal right convention,
    // but the field coordinates are defined from the top left. Therefore y = -sin(direction), not sin(direction)
    this.ballDirection = 0;

    // game lifecycle methods

    this.start = function(){
        this.started = true;
        var game = this;
        // wait around for 2 seconds and then start the game
        setTimeout(function(){
            if(game.started){
                game.ballSpeed = .005;
                // initialize the ball's direction randomly between -pi/4 and pi/4 or 3pi/4 and 5pi/4
                game.ballDirection = Math.random() * Math.PI/2 - Math.PI/4;
                if(Math.random() < .5) game.ballDirection += Math.PI;
            }
        }, 2000);
    };

    this.stop = function(){
        this.started = false;
        this.ballSpeed = 0;
        this.ballLocationX = .5;
        this.ballLocationY = .5;
    };

    this.restart = function(){
        this.stop();
        this.start();
    };

    // the tick function is called by the server every so often to tell it that time is moving. This design
    // was intentional, to decouple the game logic from the server logic, and time seems like a server thing
    this.tick = function(){
        if(this.started) this.updateBallPosition();
    };

    // the server requests the game state so it can update the clients with the relevant information
    this.state = function(){
        return {
            players: {left: this.leftPlayers, right: this.rightPlayers},
            ball: {x: this.ballLocationX, y: this.ballLocationY},
            score: {left: this.leftScore, right: this.rightScore}
        };
    };

    // logic for moving the ball around

    // updating the ball position, and detecting and handling collisions
    this.updateBallPosition = function(){
        // move the ball forward in its direction
        this.ballLocationX += this.ballSpeed * Math.cos(this.ballDirection);
        this.ballLocationY -= this.ballSpeed * Math.sin(this.ballDirection); // remember that this needs to be negative
        // if we hit the top/bottom walls, bounce back in the physical way
        if(this.ballLocationY > 1 - this.ballRadius){
            this.ballDirection = -this.ballDirection;
        }
        if(this.ballLocationY < this.ballRadius){
            this.ballDirection = -this.ballDirection;
        }
        // if we hit the side walls, someone has scored
        if(this.ballLocationX < -this.ballRadius){
            this.rightScore++;
            this.restart();
        }
        if(this.ballLocationX > 1 + this.ballRadius){
            this.leftScore++;
            this.restart();
        }
        // check for hitting a paddle
        var collisionDistance;
        var i;
        if(this.ballLocationX < .5 && (this.ballDirection > Math.PI/2 || this.ballDirection < -Math.PI/2)){
            for(i=0; i < this.leftPlayers.length; i++){
                // if the ball is on the left, moving left, run collision detection for each paddle on the left
                collisionDistance = this.collision(this.leftPlayers[i], 1);
                if(collisionDistance){
                    // if there was a collision, turn the ball around and then do our non-physical deflection
                    this.ballDirection = this.normalize(Math.PI - this.ballDirection);
                    this.deflectBall(collisionDistance, "left");
                }
            }
        }else if (this.ballLocationX > .5 && this.ballDirection < Math.PI/2 && this.ballDirection > -Math.PI/2){
            for(i=0; i < this.rightPlayers.length; i++){
                // if the ball is on the right, moving right, run collision detection for each paddle on the right
                collisionDistance = this.collision(this.rightPlayers[i], -1);
                if(collisionDistance){
                    // if there was a collision, turn the ball around and then do our non-physical deflection
                    this.ballDirection = this.normalize(Math.PI - this.ballDirection);
                    this.deflectBall(collisionDistance, "right");
                }
            }
        }
    };

    // checks for a collision between the ball and the given paddle in the given direction. The ball only collides
    // with a paddle if it hits it from the front. Returns the distance above center of the paddle where the ball hit
    // if there is a collision, returns false if there is no collision
    this.collision = function(player, direction){
        var paddleTop = player.y;
        var paddleBottom = player.y + this.paddleWidth;
        if(this.ballLocationY + this.ballRadius > paddleTop && this.ballLocationY - this.ballRadius < paddleBottom){
            // if we are within range vertically, then bother checking horizontally. The other order is probably cheaper
            var paddleFrontier = player.x + direction*this.paddleThickness/4;
            var ballFrontier = this.ballLocationX - direction*this.ballRadius;
            var difference = direction*(paddleFrontier - ballFrontier);
            if(difference > 0 && difference < Math.abs(this.ballSpeed * Math.cos(this.ballDirection))){
                return this.ballLocationY - (paddleTop + paddleBottom)/2;
            }
        }
        return false;
    };

    // deflects the ball in a non-physical fashion, to make the game more interesting. If the ball hits the center
    // of the paddle, it bounces physically. If it hits towards the edges of the paddle, it gets deflected away from
    // the normal if it is moving towards the edge of the paddle and towards the normal if it is moving towards the
    // center of the paddle. The deflection is proportional to the distance from the center of the paddle and
    // proportional to the magnitude of the angle to the tangent or to the normal, respectively. The deflection
    // is at most half of that angle. This model was chosen somewhat arbitrarily.
    this.deflectBall = function(collisionDistance, side){
        var direction = 1; // going up
        if(this.ballDirection<0){
            direction = -1; // going down
        }
        var differential;
        if(direction==1 && collisionDistance>0 || direction==-1 && collisionDistance<0){
            // divert towards the tangent a fraction of the angle to it
            differential = Math.abs(Math.PI/2 - direction*this.ballDirection);
            this.ballDirection += differential*collisionDistance/this.paddleWidth;
        }else{
            // divert towards the normal a fraction of the angle to it
            if(side == "left"){
                differential = this.ballDirection;
                this.ballDirection += differential*collisionDistance/this.paddleWidth;
            }else{
                differential = Math.PI/2 - Math.abs(this.ballDirection);
                this.ballDirection -= differential*collisionDistance/this.paddleWidth;
            }
        }
        this.ballDirection = this.normalize(this.ballDirection);
    };

    // logic for managing the players

    // when a player joins, he gets the outermost position on the side with less players, or left if they are equal
    this.newPlayer = function(name){
        // choose a random available color to assign to the player
        var index = Math.floor(Math.random() * this.availableColors.length);
        var color = this.availableColors[index];
        this.availableColors.splice(index, 1);
        // create the Player object
        var player = new Player(name, color, this);
        if (this.leftPlayers.length > this.rightPlayers.length){
            player.position = this.rightPlayers.length + 1;
            this.rightPlayers.push(player);
        }else{
            player.position = this.leftPlayers.length + 1;
            this.leftPlayers.push(player);
        }
        // now we need to reassign the players' x coordinates
        this.shiftPlayers();
        // start the game if it isn't started yet and we have two or more players
        if (!this.started && this.leftPlayers.concat(this.rightPlayers).length >= 2){
            this.start();
        }
        // return the Player object, so the server can associate it with a socket
        return player;
    };

    // when a player leaves, all players to the outside of them on their side move inwards
    this.removePlayer = function(player) {
        // release the color so it can be used again later
        this.availableColors.push(player.color);
        var index = this.leftPlayers.indexOf(player);
        var i;
        if (index < 0) {
            index = this.rightPlayers.indexOf(player);
            this.rightPlayers.splice(index, 1);
            for (i = 0; i < this.rightPlayers.length; i++) {
                this.rightPlayers[i].position = i + 1;
            }
        } else {
            this.leftPlayers.splice(index, 1);
            for (i = 0; i < this.leftPlayers.length; i++) {
                this.leftPlayers[i].position = -i - 1;
            }
        }
        // and we need to reassign the players' x coordinates
        this.shiftPlayers();
        // stop the game if it is in progress and we have less than two players
        if (this.started && this.leftPlayers.concat(this.rightPlayers).length < 2) {
            this.stop();
        }
    };

    // calculates the x locations of all players based on their field positions
    this.shiftPlayers = function(){
        var i;
        for(i=0; i < this.leftPlayers.length; i++){
            this.leftPlayers[i].x = .25 * (this.leftPlayers.length - this.leftPlayers[i].position + 1)
                / (this.leftPlayers.length + 1);
        }
        for(i=0; i < this.rightPlayers.length; i++){
            this.rightPlayers[i].x = 1 - .25 * (this.rightPlayers.length - this.rightPlayers[i].position + 1)
                / (this.rightPlayers.length + 1);
        }
    };

    // utility functions

    // normalizes an angle in radians to (-pi, pi], for ease of computation
    this.normalize = function(angle){
        if(angle > Math.PI){
            return angle - 2*Math.PI;
        }else if(angle <= -Math.PI){
            return angle + 2*Math.PI;
        }
        return angle;
    };

}

// export a single instance of a Multipong object
function createGame(){
    return new Multipong();
}