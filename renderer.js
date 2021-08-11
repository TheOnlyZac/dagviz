var ipc = require('electron').ipcRenderer;
var d3 = require('d3-graphviz');
var save = require('save-svg-as-png');
window.$ = window.jQuery = require('jquery');

/* Manage graph */

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
    lastDot = dot;
    graphviz
        .width(width)
        .height(height)
        .renderDot(dot)
}

// Set up vars to store dot text for graph
var lastDot = '';
var dot = '';

// Handle receiving dot text from main.js
ipc.on('dot-text', function(event,store) {
    dot = store;
    // re-render graph only if received dot text is different
    if (dot != lastDot) {
        render();
    }
});

ipc.on('no-game', function(event, store) {
    dot = '';
    $('#episode-title').text(store);
    // re-render graph only if received dot text is different
    if (dot != lastDot) {
        render();
    }
})

/* Manage GUI */

// GUI elements
let contextMenu;
let mousePos = { x:0, y:0 };

// Handle receiveing world ID from main.js
ipc.on('world-id', function(event, store) {
    $('#episode-title').text('Episode ' + store);
});

ipc.on('alert', function(event, store) {
    window.alert(store);
})

// Wait for document ready
window.addEventListener('DOMContentLoaded', () => {
    $contextMenu = $('#context-menu')
        .hide();

    // Store current mouse position in mousePos
    $(document).on('mousemove', function(e) {
        mousePos.x = e.pageX;
        mousePos.y = e.pageY;
    })

    // On click, hide context menu
    $(document).on('click', function() {
        $contextMenu.hide();
    })

    // On right-clicking a node, show context menu at mouse position
    $(document).on('contextmenu', '.node', function() {
        targetNode = $(this).find('title').text();
        $('.copy-address').text('Copy address 0x' + targetNode);
        $('.copy-address').attr('address', targetNode);
        $contextMenu.css('left', mousePos.x);
        $contextMenu.css('top', mousePos.y);
        $contextMenu.show();
    })

    $(document).on('click', '.copy-address', function(e) {
        e.preventDefault();
        navigator.clipboard.writeText($(this).attr('address'));
    })

    // On clicking update state button, send update-state to main.js
    $(document).on('click', '.force-state', function() {
        targetState = parseInt($(this).data('state'));
        ipc.send('force-state', { node: targetNode, state: targetState });
    })

    // On clicking reset dag button, send reset-dag to main.js
    $(document).on('click', '.reset-dag', function() {
        ipc.send('reset-dag');
    })

    // On clicking refresh dag button, send refresh-dag to main.js
    $(document).on('click', '.refresh-dag', function() {
        ipc.send('refresh-dag');
    })

    // On clicking export dot button, send export-dot to main.js
    $(document).on('click', '.export-dot', function() {
        ipc.send('export-dot');
        window.alert('Saved graph to export.dot');
    })

    // On clicking export png button, save current view to image
    $(document).on('click', '.export-png', function() {
        save.saveSvgAsPng($('svg').get(0), 'export.png', {scale: 2})
    })
})