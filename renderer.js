var ipcRenderer = require('electron').ipcRenderer;
var d3 = require('d3-graphviz');

// Init graph attributes
var dotIndex = 0;
var margin = 2;
var width = window.innerWidth - margin;
var height = window.innerHeight - margin;

// Create graphviz renderer with transitions
var graphviz = d3.graphviz('#graph')
    .on("initEnd", render)
    .on("renderEnd", () => {
        document.body.style.cursor = '';
    })
    /*.transition(function() {
        return d3.transition("main")
            .ease(d3.easeLinear)
            .delay(0)
            .duration(500)
    })*/

// Render dot graph
function render() {
    document.body.style.cursor = 'wait';
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

// Set up vars to store dot text for graph
var lastDot = '';
var dot = '';

// Handle receiving dot text from main.js
ipcRenderer.on('dot-text', function(event,store) {
    dot = store;
    // re-render graph only if received dot text is different
    if (dot != lastDot) {
        lastDot = dot;
        render();
    }
});

ipcRenderer.on('world-id', function(event, store) {
    document.getElementById('world-id').innerHTML = store;
});