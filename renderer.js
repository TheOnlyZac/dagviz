var ipcRenderer = require('electron').ipcRenderer;

var dotIndex = 0;
var margin = 20;
var width = window.innerWidth - margin;
var height = window.innerHeight - margin;

// Create graphviz renderer with transitions
var graphviz = d3.select("#graph").graphviz()
    .transition(function() {
        return d3.transition("main")
            .ease(d3.easeLinear)
            .delay(500)
            .duration(500)
    })
    .on("initEnd", render)

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
}

ipcRenderer.on('dot-text', function (event,store) {
    dot = store;
    if (dot != lastDot) {
        lastDot = dot;
        render();
    }
});

var lastDot = '';
var dot = 'digraph { a [shape="rectange" label="loading..."] }';