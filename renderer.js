var ipc = require('electron').ipcRenderer;
var d3 = require('d3-graphviz');
window.$ = window.jQuery = require('jquery');

// Init graph attributes
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

// Handle window resize event
window.onresize = function() {
    width = window.innerWidth - margin;
    height = window.innerHeight - margin;
    render();
}

// Render dot graph
function render() {
    document.body.style.cursor = 'wait';
    graphviz
        .width(width)
        .height(height)
        .renderDot(dot)
}

// Handle receiving dot text from main.js
ipc.on('dot-text', function(event,store) {
    dot = store;
    // re-render graph only if received dot text is different
    if (dot != lastDot) {
        lastDot = dot;
        render();
    }
});

// Set up vars to store dot text for graph
var lastDot = '';
var dot = '';

// Handle receiveing world ID from main.js
ipc.on('world-id', function(event, store) {
    document.getElementById('world-id').innerHTML = store;
});

// Wait for document ready
window.addEventListener('DOMContentLoaded', () => {
    // Handle clicking on nodes
    $(document).on('click', '.node', function() {
        let nodeId = $(this).find('title').text();
        console.log(`node ${nodeId} clicked!`);
        ipc.send('increment-state', nodeId);
    })
})