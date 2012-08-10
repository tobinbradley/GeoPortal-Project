/**
 * This javascript file handles page rendering and events.
 *
 * @author      Tobin license
 * @Bradley     MIT
 */

var map = null; // map
var selectedAddress = {}; // JSON selected record object
var markers = []; // Array of markers
var layersControl; // Leaflet layer control

/*  Document Ready  */
$(document).ready(function() {

    theHash = window.location.hash.split("/");
    // jQuery UI Accordion
    $('#accordion-data').accordion({
        header: "h3",
        active: theHash[2] && $("#accordion-data h3").index($("h3#" + theHash[2] )) !== -1 ? $("#accordion-data h3").index($("h3#" + theHash[2])) : 0,
        collapsible: true,
        autoHeight: false,
        create: function(event, ui) {
            $(this).fadeIn("slow");
        }
    }).bind("accordionchange", function(event, ui) {
        if (ui.newHeader[0]) $.publish("/change/accordion", [ui.newHeader[0].id]);
    });

    // jQuery UI Dialogs
    $("#search-dialog").dialog({
        width: $("#searchdiv").width(),
        autoOpen: false,
        show: 'fade',
        hide: 'fade'
    });

    // Click events
    $(".searchoptions").click(function() {
        $('#search-dialog').dialog('open');
    });
    $("#searchinput").click(function() {
        $(this).select();
    });
    $(".selectedLocation").on("click", "a", function() {
        args = $(this).data("panzoom").split(',');
        $.publish("/map/panzoom", [{
            "lon": args[0],
            "lat": args[1],
            "zoom": args[2]
        }]);
    });
    $(".datatable").on("click", "a.locate", function() {
        coords = $(this).data("coords").split(",");
        $.publish("/layers/addmarker", [{
            "lon": coords[0],
            "lat": coords[1],
            "featuretype": 1,
            "label": $(this).data("label"),
            "zoom": map.getZoom()
        }]);
    });

    /* Placeholder fix for crap browsers */
    if (!Modernizr.input.placeholder) {
        $('[placeholder]').focus(function() {
            var input = $(this);
            if (input.val() == input.attr('placeholder')) {
                input.val('');
                input.removeClass('placeholder');
            }
        }).blur(function() {
            var input = $(this);
            if (input.val() === '' || input.val() == input.attr('placeholder')) {
                input.addClass('placeholder');
                input.val(input.attr('placeholder'));
            }
        }).blur();
    }

    //  Map toolbar
    $("#mapcontrols").buttonset();
    $("#mapcontrols input:radio").click(function() {
        toolbar($(this));
    });
    $("#toolbar").fadeIn("slow");

    // URL Hash Change Handler
    $(window).hashchange(function() {
        // read the hash
        theHash = window.location.hash.split("/");

        // Process active record change
        if (theHash[1] && theHash[1] != selectedAddress.objectid) {
            locationFinder(theHash[1], "ADDRESS", "");
        }

        // Process accordion change
        if (theHash[2] && theHash[2] != $("#accordion-data h3").eq($('#accordion-data').accordion('option', 'active')).attr("id")) {
            $('#accordion-data').accordion('activate', '#' + theHash[2]);
        }
    });

    // Inital PubSub Subscriptions
    $.subscribe("/change/hash", changeHash); // Hash change control
    $.subscribe("/change/selected", setSelectedAddress); // Selected record change
    $.subscribe("/change/selected", setLocationText); // Selected record change
    $.subscribe("/change/selected", accordionDataClearShow); // Selected record change
    $.subscribe("/change/selected", zoomToLonLat); // Zoom to Location
    $.subscribe("/change/selected", addMarker); // Add Marker
    $.subscribe("/change/accordion", processAccordionDataChange); // Change accordion
    $.subscribe("/layers/addmarker", zoomToLonLat); // Zoom to location
    $.subscribe("/layers/addmarker", addMarker); // Add marker
    $.subscribe("/map/panzoom", zoomToLonLat); // Zoom to location

    // jQuery UI Autocomplete
    $("#searchinput").autocomplete({
        minLength: 4,
        delay: 400,
        autoFocus: true,
        source: function(request, response) {
            $.ajax({
                url: config.web_service_base + "v3/ws_geo_ubersearch.php",
                dataType: "jsonp",
                data: {
                    searchtypes: "address,library,school,park,geoname,road,cast,intersection,pid",
                    query: request.term
                },
                success: function(data) {
                    if (data.length > 0) {
                        response($.map(data, function(item) {
                            return {
                                label: item.name,
                                gid: item.gid,
                                responsetype: item.type
                            };
                        }));
                    } else {
                        response($.map([{}], function(item) {
                            return {
                                // No records found message
                                label: "No records found.",
                                responsetype: "I've got nothing"
                            };
                        }));
                    }
                }
            });
        },
        select: function(event, ui) {
            if (ui.item.gid) {
                locationFinder(ui.item.gid, ui.item.responsetype, ui.item.label);
            }
        },
        open: function(event, ui) {
            // Go if only 1 result
            menuItems = $("ul.ui-autocomplete li.ui-menu-item");
            if (menuItems.length == 1 && menuItems.text() != "More information needed for search." && menuItems.text() != "No records found.") {
                $($(this).data('autocomplete').menu.active).find('a').trigger('click');
            }
        }
    }).data("autocomplete")._renderMenu = function(ul, items) {
        var self = this,
            currentCategory = "";
        $.each(items, function(index, item) {
            if (item.responsetype != currentCategory && item.responsetype !== undefined) {
                ul.append("<li class='ui-autocomplete-category'>" + item.responsetype + "</li>");
                currentCategory = item.responsetype;
            }
            self._renderItem(ul, item);
        });
    };

});


/*
    Window Load
    For the stuff that either isn't safe for document ready or for things you don't want to slow page load.
*/
$(window).load(function() {

    // Initialize Map
    initializeMap();

    // Process the hash
    $(window).hashchange();

});


/*  Hash change handler  */

function changeHash(objectid, tabid) {
    var key = objectid || selectedAddress.objectid || "";
    var tab = tabid || $("#accordion-data h3").eq($("#accordion-data").accordion("option", "active")).attr("id");
    window.location.hash = "/" + key + "/" + tab;
}

/*
    Accordion switch handler
    You can toggle a layer when an accordion activates via toggleLayer(layerID)
*/
function processAccordionDataChange(accordionValue) {
    $.publish("/change/hash", [null, accordionValue]);
    if (selectedAddress.objectid) { // Make sure an address is selected
        switch (accordionValue) {

        case "SERVICES":
            if ($('#parks table tbody').html().length < 5) { // Make sure information isn't already popupated
                // Parks
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'parks', 'prkname as name,prkaddr as address,prktype,city, x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat', '', 50000, "", "5", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#parks table tbody").tableGenerator({
                        'fields': ['item.row.name', 'item.row.address'],
                        'data': data
                    });
                });
                // Get libraries
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'libraries', 'name,address,city, x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat', '', 100000, "", "5", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#libraries table tbody").tableGenerator({
                        'fields': ['item.row.name', 'item.row.address'],
                        'data': data
                    });
                });
                // Fire Stations
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'fire_stations', 'name,address,station_ty as type,x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat', '', 264000, "", "3", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#fire-stations table tbody").tableGenerator({
                        'fields': ['item.row.name', 'item.row.type', 'item.row.address'],
                        'data': data
                    });
                });
            }
            break;

        case "TRANSPORTATION":
            if ($('#bus-stops table tbody').html().length == 0) { // Make sure information isn't already popupated
                // CATS Bus Stops
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'busstops_pt', "stopdesc as name, replace(routes, ',', ', ') as address,x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat", '', 10000, "", "10", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#bus-stops table tbody").tableGenerator({
                        'fields': ['item.row.name', 'item.row.address'],
                        'data': data
                    });
                });
                // CATS Park and Ride Locations
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'cats_park_and_ride', 'name,routes,address,x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat', '', 100000, "", "3", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#park-and-rides table tbody").tableGenerator({
                        'fields': ['item.row.name', 'item.row.address', 'item.row.routes'],
                        'data': data
                    });
                });
                // CATS Light Rail Stops
                url = pointBuffer(selectedAddress.x_coordinate, selectedAddress.y_coordinate, 2264, 'cats_light_rail_stations', "name,'' as address, x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat", '', 126400, "", "3", 'json', '?');
                $.getJSON(url, function(data) {
                    $("#light-rail-stops table tbody").tableGenerator({
                        'fields': ['item.row.name'],
                        'data': data
                    });
                });
            }
            break;
        }
    }
}


/*  Set selected address  */

function setSelectedAddress(data) {
    selectedAddress = {
        "objectid": data.objectid,
        "x_coordinate": data.x_coordinate,
        "y_coordinate": data.y_coordinate,
        "parcelid": data.parcel_id,
        "address": data.address,
        "postal_city": data.postal_city,
        "lon": data.longitude,
        "lat": data.latitude
    };
}

/*  update selected location text  */

function setLocationText(data) {
    $('.selectedLocation').html('<strong><a href="javascript:void(0)" data-panzoom="' + data.longitude + ', ' + data.latitude + ', 17" > ' + data.address + '</a></strong>');
}

/*  clear data areas and make them visible  */

function accordionDataClearShow() {
    $('.selected-data-clear, .datatable tbody').empty();
    $('.selected-data').show();
}

/*
    Find locations
    @param {string} findID  The value to search for
    @param {string} findType  The type of find to perform
    @param {string} findValue  The value to search for (street name)
*/
function locationFinder(findID, findType, findValue) {
    switch (findType) {
    case "ADDRESS":
    case "PID":
        url = config.web_service_base + 'v2/ws_mat_addressnum.php?format=json&callback=?&jsonp=?&addressnum=' + findID;
        $.getJSON(url, function(data) {
            if (data.total_rows > 0) {
                // Add some properties for addmarker
                data.rows[0].row.lon = data.rows[0].row.longitude;
                data.rows[0].row.lat = data.rows[0].row.latitude;
                data.rows[0].row.featuretype = 0;
                data.rows[0].row.label = "<h5>Address</h5>" + data.rows[0].row.address;
                data.rows[0].row.zoom = 17;
                $.publish("/change/selected", [data.rows[0].row]);
                $.publish("/change/hash");
                $.publish("/change/accordion", [$("#accordion-data h3").eq($('#accordion-data').accordion('option', 'active')).prop("id")]);
            }
        });
        break;
    case "LIBRARIES":
    case "PARKS":
    case "SCHOOLS":
    case "GEONAMES":
    case "CATS LIGHT RAIL":
    case "CATS PARK AND RIDE":
        // Set list of fields to retrieve from POI Layers
        poiData = {
            "LIBRARIES" : { "table": "libraries", "fields" : "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p>' || address || '</p>' AS label" },
            "PARKS": { "table": "parks" , "fields": "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || prkname || '</h5><p>Type: ' || prktype || '</p><p>' || prkaddr || '</p>' AS label"},
            "SCHOOLS": { "table": "schools_1112", "fields": "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || coalesce(schlname,'') || '</h5><p>' || coalesce(type,'') || ' School</p><p>' || coalesce(address,'') || '</p>' AS label" },
            "GEONAMES": { "table": "geonames", "fields": "longitude as lon, latitude as lat, '<h5>' || name || '</h5>'  as label" },
            "CATS LIGHT RAIL": { "table": "cats_light_rail_stations", "fields": "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p></p>' as label"},
            "CATS PARK AND RIDE": { "table":  "cats_park_and_ride", "fields": "x(transform(the_geom, 4326)) as lon, y(transform(the_geom, 4326)) as lat, '<h5>' || name || '</h5><p>Routes ' || routes || '</p><p>' || address || '</p>' AS label"}
        };
        url = config.web_service_base + "v1/ws_geo_attributequery.php?format=json&geotable=" + poiData[findType].table + "&parameters=gid = " + findID + "&fields=" + urlencode(poiData[findType].fields) + '&callback=?';
        $.getJSON(url, function(data) {
            $.publish("/layers/addmarker", [{
                "lon": data.rows[0].row.lon,
                "lat": data.rows[0].row.lat,
                "featuretype": 1,
                "label": "<h5>Location</h5>" + data.rows[0].row.label,
                "zoom": 16
            }]);
        });
        break;
    case "ROADS":
        url = config.web_service_base + "v1/ws_geo_getcentroid.php?format=json&geotable=roads&parameters=streetname='" + findValue.toUpperCase() + "' order by ll_add limit 1&forceonsurface=true&srid=4326&callback=?";
        $.getJSON(url, function(data) {
            $.publish("/layers/addmarker", [{
                "lon": data.rows[0].row.x,
                "lat": data.rows[0].row.y,
                "featuretype": 1,
                "label": "<h5>Road</h5>" + findValue,
                "zoom": 16
            }]);
        });

        break;
    case "INTERSECTION":
        url = config.web_service_base + "v1/ws_geo_centerlineintersection.php?format=json&callback=?";
        streetnameArray = findValue.split("&");
        args = "&srid=4326&streetname1=" + urlencode(jQuery.trim(streetnameArray[0].toUpperCase())) + "&streetname2=" + urlencode(jQuery.trim(streetnameArray[1].toUpperCase()));
        $.getJSON(url + args, function(data) {
            if (data.total_rows > 0) {
                $.publish("/layers/addmarker", [{
                    "lon": data.rows[0].row.xcoord,
                    "lat": data.rows[0].row.ycoord,
                    "featuretype": 1,
                    "label": "<h5>Intersection</h5>" + findValue,
                    "zoom": 15
                }]);
            }
        });
        break;
    }
}
