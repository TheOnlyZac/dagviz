var ipc = require('electron').ipcRenderer;
var d3 = require('d3-graphviz');
var save = require('save-svg-as-png');
window.$ = window.jQuery = require('jquery');

const BUILDS = ['sly2ntsc', 'sly3ntsc', 'sly2mar', 'sly3aug', 'sly3sep'];

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

// Send current settings values to main.js
function sendSettings() {
    var settings = {
        'auto-detect-build': $('#pref-autodetect').is(':checked'),
        'build': $('#pref-build').val(),
        'nodes-display': $('#pref-nodes-display').val(),
        'base-address': $('#pref-base-address').val()
    };
    ipc.send('set-settings', settings);
}

// Handle receiveing world ID from main.js
ipc.on('world-id', function(event, store) {
    $('#episode-title').text('Episode ' + store);
});

ipc.on('build', function(event, store) {
    var $prefBuild = $('#pref-build');
    if (store == -1) {
        $prefBuild.val('none');
    } else {
        $prefBuild.val(BUILDS[store]);
    }
})

ipc.on('alert', function(event, store) {
    window.alert(store);
})

// Wait for document ready
window.addEventListener('DOMContentLoaded', () => {

    // Hide Context Menu by default
    $contextMenu = $('#context-menu')
        .hide();

    /* PANELS */

    // Init mouse position and dragged element
    var mousePos = { x: 0, y: 0 };
	var dragOffset = { x: 0, y: 0 };
	var $draggedElement = undefined;

    // On Mouse Move event
    $(document).on('mousemove', function(e) {
		// Upade saved mouse pos
        mousePos.x = e.pageX;
        mousePos.y = e.pageY;
		
		// If an element is being dragged, update it's position
		if ($draggedElement != undefined) {
			$draggedElement.css({
				'left': mousePos.x - dragOffset.x,
				'top': mousePos.y - dragOffset.y
			});
		}
    })
    
	// On Mouse Down event on drag handle
	$('.drag-handle').on('mousedown', function() {
		// Get position of draggable element that was clicked
		let $panel = $(this).closest('.panel');
		let panelPos = {
			x: $panel.css('left').replace(/[^-\d\.]/g, ''),
			y: $panel.css('top').replace(/[^-\d\.]/g, '')
		};
		
		// Calculate/store the offset from the element topleft corner to the mouse
		dragOffset.x = mousePos.x - panelPos.x;
		dragOffset.y = mousePos.y - panelPos.y;
		
		// Store the currently dragged element
		$draggedElement = $panel;
	});

	// On Mouse Up event
	$(document).on('mouseup', function() {
		// Clear the currently dragged element
		$draggedElement = undefined;
	});
	
	// Handle click event on show/hide button
	$('.showhide-btn').on('click', function() {
		$panel = $(this).closest('.panel');
		$(".panel-row:not(:first-child)", $panel).toggle();
		if ($panel.hasClass('collapsed')) $panel.removeClass('collapsed');
		else $panel.addClass('collapsed');
	})
	
	// Handle click on close button
	$('.close-btn').on('click', function() {
		$panel = $(this).closest('.panel');
		$panel.remove();
	})


    // Send initial settings to main.js
    sendSettings();

    // Handle changed input/select element
	$('input, select').on('change', function() {
		var $this = $(this);
        if ($this.attr('id') == 'pref-autodetect') {
            let prefBuild = document.getElementById('pref-build');
            if ($this.is(':checked')) {
                prefBuild.disabled = true
            } else {
                prefBuild.disabled = false;
                $(prefBuild).val('none');
            }
        }
        // Send updated settings to main.js
        sendSettings();
	})

    /* TITLEBAR */

    // Handle minimize window
    $(document).on('click', '.win-min', () => ipc.send('minimize'))

    // Handle maximize window
    $(document).on('click', '.win-max', () => ipc.send('maximize'))

    // Handle close window
    $(document).on('click', '.win-close', () => window.close())

    /* CONTEXT MENU */

    // On click, hide context menu
    $(document).on('click', function() {
        $contextMenu.hide();
    })

    // On right-clicking a node, show context menu at mouse position
    $(document).on('contextmenu', '.node', function() {
        targetNode = $(this).find('title').text();
        $('.copy-address').text('Copy address 0x' + targetNode);
        $('.copy-address').attr('address', targetNode);
        $contextMenu.css({
            'left': mousePos.x,
            'top': mousePos.y
        });
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