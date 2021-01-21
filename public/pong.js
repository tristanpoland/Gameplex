var gl = null,
    canvas = null,
    glProgram = null,
    fragmentShader = null,
    vertexShader = null;
var vertexPositionAttribute = null,
    cubeVerticeBuffer = null;
var vertexColorAttribute = null,
    cubeColorBuffer = null,
    cubeIndicesBuffer = null;
var diskIndicesBuffer = null;
var mvMatrix = mat4.create();

goInterval = null;
masterPong = false;
pongRunning = false;
pongStarted = false;

var mov_axis = 'y';

const DX_INIT = 0.1;
const DX_MAX = 0.58;
const DX_INCR = 0.03;

const DY_MAX = 0.22;
const DY_HIT_INCR = 0.31;

const MAX_BAR_POS = 3.7;
const DISK_FACES = 15;

var playerA = {
    posX: -6.0,
    posY: 0.0,
    color: {r:1, g:0, b:0},
    score: 0
}

var playerB = {
    posX: 6.0,
    posY: 0.0,
    color: {r:0, g:0, b:1},
    score: 0
}

var disk = {
    posX: 0.0,
    posY: 0.0,
    dX: DX_INIT,
    dY: 0.0,
    color: {r:1, g:1, b:1}
}

function initWebGL() {
    initColorBarSelection();
    canvas = document.getElementById("my-canvas");
    try {
        gl = canvas.getContext("webgl") ||
            canvas.getContext("experimental-webgl");
    } catch (e) {}
    if (gl) {
        initShaders();
        setupBuffers();
        getUniforms();
        $(document).keydown(handleKeyEvent);
        $(document).mousemove(handleMouseEvent);
        (function animLoop() {
            setupWebGL();
            drawScene();
            requestAnimationFrame(animLoop, canvas);
        })();
    } else {
        alert("Error: Your browser does not appear to support WebGL.");
    }
}

//JQueryUI
function initColorBarSelection() {
    function refreshSwatch() {
        playerA.color.r = $( "#redBar" ).slider("value")/255,
        playerA.color.g = $( "#greenBar" ).slider("value")/255,
        playerA.color.b = $( "#blueBar" ).slider("value")/255;
    }

    $( "#redBar, #greenBar, #blueBar" ).slider({
      orientation: "horizontal",
      range: "min",
      max: 255,
      value: 127,
      slide: refreshSwatch,
      change: refreshSwatch
    });
    $( "#redBar" ).slider( "value", 0 );
    $( "#greenBar" ).slider( "value", 0 );
    $( "#blueBar" ).slider( "value", 255 );
}

function handleKeyEvent(ev) {
    var ymov = 0.3;
    if (mov_axis=='y'){
        if (ev.which == 38){
            playerA.posY += ymov;
            if (playerA.posY > MAX_BAR_POS) playerA.posY = MAX_BAR_POS;
        }else if (ev.which == 40) {
            playerA.posY -= ymov;
            if (playerA.posY < -MAX_BAR_POS) playerA.posY = -MAX_BAR_POS;
        }
    } else {
        if (ev.which == 37){
            playerA.posY += ymov;
            if (playerA.posY > MAX_BAR_POS) playerA.posY = MAX_BAR_POS;
        }else if (ev.which == 39) {
            playerA.posY -= ymov;
            if (playerA.posY < -MAX_BAR_POS) playerA.posY = -MAX_BAR_POS;
        }
    }
}

function handleMouseEvent(event) {
    // http://stackoverflow.com/a/18053642
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
    // end
    if (mov_axis=='y'){
        playerA.posY = MAX_BAR_POS * (1- y/(canvas.height/2));
        if (playerA.posY > MAX_BAR_POS) playerA.posY = MAX_BAR_POS;
        if (playerA.posY < -MAX_BAR_POS) playerA.posY = -MAX_BAR_POS;
    } else {
        playerA.posY = MAX_BAR_POS * (1- x/(canvas.width/2));
        if (playerA.posY > MAX_BAR_POS) playerA.posY = MAX_BAR_POS;
        if (playerA.posY < -MAX_BAR_POS) playerA.posY = -MAX_BAR_POS;
    }
}

function changeCamera(type) {
    var pMatrix = mat4.create();
    var ratio = canvas.width / canvas.height;
    mat4.perspective(60, ratio, 0.1, 100, pMatrix);
    if (type == '3d side'){
        mat4.translate(pMatrix, [0.0, 7.0, -3.0]);
        mat4.rotate(pMatrix, 0.7, [-1.0, 0.0, 0.0]);
        mov_axis = 'y';
    } else if (type == '3d back') {
        mat4.translate(pMatrix, [0.0, 10.0, -6.0]);
        mat4.rotate(pMatrix, 1.57, [0.0, 0.0, 1.0]);
        mat4.rotate(pMatrix, 1.0, [0.0, 0.5, 0.0]);
        mov_axis = 'x';
    } else {
        mov_axis = 'y';
    }
    gl.uniformMatrix4fv(glProgram.uPMatrix, false, pMatrix);
}

function sendGameStatus() {
    var objToSend = {
        'type': 'game_status',
        'disk': {'x': disk.posX, 'y': disk.posY},
        'player': {'y': playerA.posY, 'color': playerA.color},
    }
    window.LocalDC.send(JSON.stringify(objToSend));
}

function sendPlayerPosition() {
    var objToSend = {
        'type': 'game_status',
        'player': {'y': playerA.posY, 'color': playerA.color}
    }
    window.LocalDC.send(JSON.stringify(objToSend));
}

function updateStatusPong(msg) {
    if (!masterPong && msg.disk){
        disk.posX = -msg.disk.x;
        disk.posY = msg.disk.y;
        if (Math.abs(disk.posX) === 5.40000000001)
            iluminateDisk();
    }
    playerB.posY = msg.player.y;
    playerB.color = msg.player.color;
}

function updateScore(msg) {
    window.pongRunning = false;
    if (msg.score.you > playerA.score){
       newPoint(playerA);
    }else if (msg.score.me > playerB.score){
       newPoint(playerB);
    }
}

function newPoint(player) {
    window.masterPong = !window.masterPong;
    newIntervalGo(3);
    //player scores
    $( "#score" ).effect( 'shake', {}, 2000);
    player.score += 1;
    $('#localScore').html(playerA.score);
    $('#remoteScore').html(playerB.score);
    resetDisk();
}

function newIntervalGo(timeLeft) {
    if (goInterval) clearInterval(goInterval);
    goInterval = setInterval(function () {
        if (timeLeft > 0){
            $('#timeLeft').html(timeLeft);
        } else {
            clearInterval(goInterval);
            goInterval = null;
            $('#timeLeft').html('GO!');
            if (window.pongStarted)
                window.pongRunning = true;
        }
        timeLeft--;
    }, 1000);
}

function setupWebGL() {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    //set the clear color to a shade of green
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    gl.viewport(0, 0, canvas.width, canvas.height);
}

function initShaders() {
    //get shader source
    var fs_source = document.getElementById('shader-fs').innerHTML,
        vs_source = document.getElementById('shader-vs').innerHTML;
    //compile shaders
    vertexShader = makeShader(vs_source, gl.VERTEX_SHADER);
    fragmentShader = makeShader(fs_source, gl.FRAGMENT_SHADER);
    //create program
    glProgram = gl.createProgram();
    //attach and link shaders to the program
    gl.attachShader(glProgram, vertexShader);
    gl.attachShader(glProgram, fragmentShader);
    gl.linkProgram(glProgram);
    if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
        alert("Unable to initialize the shader program.");
    }
    //use program
    gl.useProgram(glProgram);
}

function makeShader(src, type) {
    //compile the vertex shader
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert("Error compiling shader: " + gl.getShaderInfoLog(shader));
    }
    return shader;
}

function getDiskAttrAndIndices(slices) {
    var attrs = [];
    var indices = [];
    var colorDown = {r:0.5, g:0.5, b:0.5};
    var colorUp = {r:1.0, g:1.0, b:1.0};

    attrs.push(0.0, 0.0, 1.0, colorUp.r, colorUp.g, colorUp.b); //top center
    attrs.push(0.0, 0.0,-1.0, colorDown.r, colorDown.g, colorDown.b); //bottom center
    for (var i = 0; i<slices; i++) {
        var angle = i*2*Math.PI/slices;
        var x = Math.cos(angle);
        var y = Math.sin(angle);
        attrs.push(x, y, 1, colorUp.r, colorUp.g, colorUp.b);//top (top color)
        attrs.push(x, y, 1, colorDown.r, colorDown.g, colorDown.b);//top (bottom color)
        attrs.push(x, y, -1, colorDown.r, colorDown.g, colorDown.b);//bottom (bottom color)
        if (i === 0) continue
        var prev_top_a = 2+(i-1)*3, prev_top_b = 3+(i-1)*3, prev_bot = 4+(i-1)*3;
        var curr_top_a = 2+(i  )*3, curr_top_b = 3+(i  )*3, curr_bot = 4+(i  )*3;
        indices.push(0, prev_top_a, curr_top_a); //top
        indices.push(prev_top_b, prev_bot, curr_top_b); //ext1
        indices.push(prev_bot, curr_top_b, curr_bot); //ext2
        indices.push(1, prev_bot, curr_bot); //bottom
        if (i == slices-1) {
            //connect begining with end
            indices.push(0, 2, curr_top_a); //top
            indices.push(3, 4, curr_top_b); //ext1
            indices.push(4, curr_top_b, curr_bot); //ext2
            indices.push(1, 4, curr_bot); //bottom
        }
    }
    return {'indices': indices, 'attr': attrs}
}

function setupBuffers() {
    var cubeAttributes = [
        //bottom
        -1.0,-1.0,-1.0,     0.0,0.0,0.0,
         1.0,-1.0,-1.0,     0.0,0.0,0.0,
         1.0, 1.0,-1.0,     0.0,0.0,0.0,
        -1.0, 1.0,-1.0,     0.0,0.0,0.0,
        //top
        -1.0,-1.0, 1.0,     1.0,1.0,1.0,
         1.0,-1.0, 1.0,     1.0,1.0,1.0,
         1.0, 1.0, 1.0,     1.0,1.0,1.0,
        -1.0, 1.0, 1.0,     1.0,1.0,1.0,
        //left
        -1.0,-1.0,-1.0,     0.5,0.5,0.5,
        -1.0, 1.0,-1.0,     0.5,0.5,0.5,
        -1.0, 1.0, 1.0,     0.5,0.5,0.5,
        -1.0,-1.0, 1.0,     0.5,0.5,0.5,
        //right
         1.0,-1.0,-1.0,     0.5,0.5,0.5,
         1.0, 1.0,-1.0,     0.5,0.5,0.5,
         1.0, 1.0, 1.0,     0.5,0.5,0.5,
         1.0,-1.0, 1.0,     0.5,0.5,0.5,
         //behind
        -1.0,-1.0,-1.0,     0.5,0.5,0.5,
        -1.0,-1.0, 1.0,     0.5,0.5,0.5,
         1.0,-1.0, 1.0,     0.5,0.5,0.5,
         1.0,-1.0,-1.0,     0.5,0.5,0.5,
         //front
        -1.0, 1.0,-1.0,     0.5,0.5,0.5,
        -1.0, 1.0, 1.0,     0.5,0.5,0.5,
         1.0, 1.0, 1.0,     0.5,0.5,0.5,
         1.0, 1.0,-1.0,     0.5,0.5,0.5,
    ];
    cubeAttributesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeAttributesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeAttributes), gl.STATIC_DRAW);

    var cubeIndices = [
        0, 1, 2,
        0, 2, 3,

        4, 5, 6,
        4, 6, 7,

        8, 9, 10,
        8, 10, 11,

        12, 13, 14,
        12, 14, 15,

        16, 17, 18,
        16, 18, 19,

        20, 21, 22,
        20, 22 ,23
    ];
    cubeIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);

    var disk = getDiskAttrAndIndices(DISK_FACES);
    diskAttributesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, diskAttributesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(disk.attr), gl.STATIC_DRAW);
    diskIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, diskIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(disk.indices), gl.STATIC_DRAW);

    vertexPositionAttribute = gl.getAttribLocation(glProgram, "aVertexPosition");
    gl.enableVertexAttribArray(vertexPositionAttribute);

    vertexColorAttribute = gl.getAttribLocation(glProgram, "aVertexColor");
    gl.enableVertexAttribArray(vertexColorAttribute);
}

function resetDisk() {
    disk.posX = 0;
    disk.posY = 0;
    disk.dY = 0;
    disk.dX = DX_INIT;
}

function checkDiskLimits() {
    if (disk.dY > DY_MAX)  disk.dY = DY_MAX;
    if (disk.dY < -DY_MAX) disk.dY = -DY_MAX;
    if (disk.dX > DX_MAX)  disk.dX = DX_MAX;
    if (disk.dX < -DX_MAX) disk.dX = -DX_MAX;
}

function iluminateDisk() {
    disk.color.b = 0
    setTimeout(function () {disk.color.b = 1}, 200);
}

function calculateDiskPosition(delta) {
    disk.posX += disk.dX*delta;
    disk.posY += disk.dY*delta;
    //Point score
    if (Math.abs(disk.posX) > 7) {
        pongRunning = false;
        if (disk.posX < 7) newPoint(playerB);
        else newPoint(playerA);
        var objToSend = {
            'type': 'update_score',
            'score': {'you': playerB.score, 'me': playerA.score}
        }
        window.LocalDC.send(JSON.stringify(objToSend));
    }
    //Wall
    if (disk.posY > 4.8 || disk.posY < -4.8) {
        disk.posY -= disk.dY;
        disk.dY = -disk.dY;
    }
    //playerB
    if (disk.posX > 5.4 && disk.posX < 6.4 && (playerB.posY+1.5)>(disk.posY-0.4) && (playerB.posY-1.5)<(disk.posY+0.4)){
        disk.dX = -Math.abs(disk.dX);
        disk.posX = 5.40000000001;//Correct position
        disk.dY += (disk.posY-playerB.posY)/1.9*DY_HIT_INCR;
        disk.dX -= DX_INCR;//level up
        checkDiskLimits();
        iluminateDisk();
    }
    //playerA
    if (disk.posX < -5.4 && disk.posX > -6.4 && (playerA.posY+1.5)>(disk.posY-0.4) && (playerA.posY-1.5)<(disk.posY+0.4)){
        disk.dX = Math.abs(disk.dX);
        disk.posX = -5.40000000001;//correct position
        disk.dY += (disk.posY-playerA.posY)/1.9*DY_HIT_INCR;
        disk.dX += DX_INCR;//level up
        checkDiskLimits();
        iluminateDisk();
    }
}

function moveTestPlayer() {
    playerA.posY = disk.posY + Math.random()*(-1.0-1.0) + 1.0;
}

var lastUpdate = 0;
function drawScene() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var time =  Date.now();
    var delta = 1;
    if (lastUpdate){
        delta = 30*(time-lastUpdate)/1000;
        if (delta > 2) console.log(masterPong, delta);
    }
    lastUpdate = time;
    if (window.pongStarted && window.pongRunning && window.masterPong){
        calculateDiskPosition(delta);
    }
    if (window.pongStarted){
        if (window.masterPong){
            sendGameStatus();
        } else {
            sendPlayerPosition();
        }
    }

    //moveTestPlayer();

    //cube buffer
    bindCubeBuffers();// 1 method for performance
    drawBarPlayer(playerA);
    drawBarPlayer(playerB);
    drawWall(-5.4);
    drawWall(5.4);
    drawBoard();
    //disk buffer
    drawDisk();//uses a diferent buffer
}

function bindCubeBuffers() {
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeAttributesBuffer);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 4*(3+3), 0);
    gl.vertexAttribPointer(vertexColorAttribute, 3, gl.FLOAT, false, 4*(3+3), 3*4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndicesBuffer);
}

function drawWall(ypos) {
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [0, ypos, -10]);
    mat4.scale(mvMatrix, [7, 0.2, 0.2]);
    gl.uniformMatrix4fv(glProgram.uMVMatrix, false, mvMatrix);
    gl.uniform3f(glProgram.ucolor, 0, 0.7, 0);
    gl.drawElements(gl.TRIANGLES, 6*6, gl.UNSIGNED_SHORT, 0);
}

function drawBoard() {
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [0, 0, -12.0]);
    mat4.scale(mvMatrix, [7, 5.6, 1.8]);
    gl.uniformMatrix4fv(glProgram.uMVMatrix, false, mvMatrix);
    gl.uniform3f(glProgram.ucolor, 0, 0.8, 0);
    gl.drawElements(gl.TRIANGLES, 6*6, gl.UNSIGNED_SHORT, 0);
}

function drawBarPlayer(player) {
    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [player.posX, player.posY, -9.9]);
    mat4.scale(mvMatrix, [0.2, 1.5, 0.3]);
    gl.uniformMatrix4fv(glProgram.uMVMatrix, false, mvMatrix);
    gl.uniform3f(glProgram.ucolor, player.color.r, player.color.g, player.color.b);
    gl.drawElements(gl.TRIANGLES, 6*6, gl.UNSIGNED_SHORT, 0);
}

function drawDisk() {
    gl.bindBuffer(gl.ARRAY_BUFFER, diskAttributesBuffer);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 4*(3+3), 0);
    gl.vertexAttribPointer(vertexColorAttribute, 3, gl.FLOAT, false, 4*(3+3), 3*4);

    mat4.identity(mvMatrix);
    mat4.translate(mvMatrix, [disk.posX, disk.posY, -10.0]);
    mat4.scale(mvMatrix, [0.4, 0.4, 0.15]);
    gl.uniformMatrix4fv(glProgram.uMVMatrix, false, mvMatrix);

    gl.uniform3f(glProgram.ucolor, disk.color.r, disk.color.g, disk.color.b);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, diskIndicesBuffer);
    gl.drawElements(gl.TRIANGLES, 12*DISK_FACES, gl.UNSIGNED_SHORT, 0);
}

function getUniforms() {
    glProgram.uMVMatrix = gl.getUniformLocation(glProgram, "uMVMatrix");
    glProgram.uPMatrix = gl.getUniformLocation(glProgram, "uPMatrix");
    //uniform for color
    glProgram.ucolor = gl.getUniformLocation(glProgram, "uColor");
    var pMatrix = mat4.create();
    var ratio = canvas.width / canvas.height;
    mat4.perspective(60, ratio, 0.1, 100, pMatrix);
    mat4.translate(pMatrix, [0.0, 7.0, -3.0]);
    mat4.rotate(pMatrix, 0.7, [-1.0, 0.0, 0.0]);

    gl.uniformMatrix4fv(glProgram.uPMatrix, false, pMatrix);
}

function stopWebGl() {
    masterPong = false;
    pongRunning = false;
    pongStarted = false;

    playerA.score = 0;

    playerB.posY = 0.0;
    playerB.color = {r:0, g:0, b:1};
    playerB.score = 0;
    $('#localScore').html('0');
    $('#remoteScore').html('0');
    clearInterval(goInterval);
    $('#timeLeft').html('Wait...');

    resetDisk();
}
