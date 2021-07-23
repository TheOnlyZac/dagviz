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
            .duration(1500)
    })
    .on("initEnd", render)

// Render dot graph
function render() {
    var dot = dots[dotIndex];
    graphviz
        .width(width)
        .height(height)
        .renderDot(dot)
        .on("end", function() {
            dotIndex = (dotIndex + 1) % dots.length;
            render();
        })
}

// Handle window resize event
window.onresize = function() {
    width = window.innerWidth - margin;
    height = window.innerHeight - margin;
}

ipcRenderer.on('dot-text', function (event,store) {
    dots = [store]
});

var dots = ['digraph { a [shape="rectange" label="loading..."] }'];