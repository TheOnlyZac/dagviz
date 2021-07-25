var ipcRenderer = require('electron').ipcRenderer;
var d3 = require('d3-graphviz');
console.log(d3);

// Init graph attributes
var dotIndex = 0;
var margin = 20;
var width = window.innerWidth - margin;
var height = window.innerHeight - margin;

// Create graphviz renderer with transitions
var graphviz = d3.graphviz("#graph");
    /*.transition(function() {
        return d3.transition("main")
            .ease(d3.easeLinear)
            .delay(0)
            .duration(500)
    })
    .on("initEnd", render);*/

// Render dot graph
function render() {
    graphviz
        .width(width)
        .height(height)
        .renderDot(dot)
}

// Handle window resize event
window.onresize = function() {
    width = window.innerWidth - margin;
    height = window.innerHeight - margin;
    render();
}

// Handle receiving dot text from main.js
ipcRenderer.on('dot-text', function (event,store) {
    dot = store;
    if (dot != lastDot) {
        lastDot = dot;
        render();
    }
});

var lastDot = '';
var dot = '';