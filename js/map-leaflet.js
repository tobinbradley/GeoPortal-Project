/*
    This file handles map initialization and events.
    @author  Tobin Bradley
    @license     MIT
*/


/*  Map Initialization  */

function initializeMap() {

    /*  initialize map  */
    map = new L.Map('map', {
        center: new L.LatLng(parseFloat(config.default_map_center[0]), parseFloat(config.default_map_center[1])),
        zoom: config.default_map_zoom,
        attributionControl: false,
        minZoom: config.default_map_min_zoom,
        maxZoom: config.default_map_max_zoom
    });

    /*  Coordinate display  */
    map.on('mousemove', function(event) {
        $("#toolbar-coords").text(event.latlng.lng.toFixed(4) + " " + event.latlng.lat.toFixed(4));
    });

    /*
        Reset minzoom of the map when layers are toggled by the layer control
        By default leaflet will change the map zoom levels based on layers
        If you really want that behavior you can take this out.
    */
    map.on('layeradd', function(event) {
        map._layersMinZoom = config.default_map_min_zoom;
        map._layersMaxZoom = config.default_map_max_zoom;
    });

    /* Add marker on locationfound event */
    map.on('locationfound', function(e) {
        var radius = e.accuracy / 2;
        $.publish("/layers/addmarker", [{
            "lon": e.latlng.lng,
            "lat": e.latlng.lat,
            "featuretype": 1,
            "label": "<h5>GeoLocation</h5>You are within " + radius + " meters of this point.",
            "zoom": 17
        }]);
    });

    /*  Add Layers  */
    var baseMaps = addMapLayers(config.base_map_layers);
    var overlayMaps = addMapLayers(config.overlay_map_layers);

    /*  Layer Control  */
    layersControl = new L.Control.Layers(baseMaps, overlayMaps);
    map.addControl(layersControl);

    /*  Locate user position via GeoLocation API  */
    if (Modernizr.geolocation) {
        $("#gpsarea").show();
        $("#gps").click(function() {
            map.locate({
                enableHighAccuracy: true
            });
        });
    }

    /*  Opacity Slider */
    $.each(overlayMaps, function(key, val) {
        $('#opacitydll').append('<option value="' + val.options.id + '">' + key + '</option>');
    });
    $('#opacitySlider').slider({
        range: "min",
        min: 0.1,
        max: 1,
        step: 0.05,
        value: 0.50,
        stop: function(event, ui) {
            theLayer = getLayerLeaflet($('#opacitydll').val());
            if (theLayer) map._layers[theLayer].setOpacity(ui.value);
        }
    });
    $('#opacitydll').change(function() {
        theLayer = getLayerLeaflet($('#opacitydll').val());
        if (theLayer) $("#opacitySlider").slider("option", "value", map._layers[theLayer].options.opacity);
    });
    $('#opacitySlider').sliderLabels('MAP', 'DATA');

}


/*
    Adds layers to the map on initial map load.
    Input array comes from the config.json file.
    Returns a JSON object containing name:layer for each layer type for the layers control
 */
function addMapLayers(layersArray) {
    var layers = {};
    $.each(layersArray, function(index, value) {
        if (value.wmsurl.indexOf("{x}") != -1) {
            layers[value.name] = new L.TileLayer(value.wmsurl, value);
        } else {
            layers[value.name] = new L.TileLayer.WMS(value.wmsurl, value);
        }
        if (value.isVisible) map.addLayer(layers[value.name]);
    });
    return layers;
}

/*  Get map layer from leaflet  */

function getLayerLeaflet(layerID) {
    var theLayer = null;
    $.each(map._layers, function(index, val) {
        if (val.options.id == layerID) theLayer = index;
    });
    return theLayer;
}

/*  Get layer from config  */

function getLayerConfig(layerID) {
    var theLayer = null;
    $.each(config.overlay_map_layers, function(index, val) {
        if (val.id == layerID) theLayer = val;
    });
    return theLayer;
}

/*  Programatically toggle layers on the layer control  */

function toggleLayer(layerid) {
    theLayer = getLayerConfig(layerid);
    if (theLayer) {
        $(".leaflet-control-layers-overlays label").each(function() {
            if (theLayer.name == $(this).text().trim()) {
                $(this).children("input").trigger("click");
            }
        });
    }
}

/*
    Perform identify based on map click.
    Note minimum zoom level set - you might want to screw with that for your application.
*/
function identify(event) {
    if (map.getZoom() >= 16) selectByCoordinate(event.latlng.lng, event.latlng.lat);
}

/*  Select parcel with lon,lat  */

function selectByCoordinate(lon, lat) {
    url = pointOverlay(lon, lat, 4326, 'tax_parcels', 'pid', "", 'json', '?');
    $.getJSON(url, function(data) {
        if (data.total_rows > 0) {
            url = config.web_service_base + "v1/ws_mat_pidgeocode.php?format=json&callback=?";
            args = "&pid=" + urlencode(data.rows[0].row.pid);
            url = url + args;
            $.getJSON(url, function(data) {
                if (data.total_rows > 0) {
                    message = "<h5>Identfy</h5>" + data.rows[0].row.address + "<br />PID: " + data.rows[0].row.parcel_id;
                    message += "<br /><br /><strong><a href='javascript:void(0)' class='identify_select' data-matid='" + data.rows[0].row.objectid + "' onclick='locationFinder(\"Address\", \"master_address_table\", \"objectid\", " + data.rows[0].row.objectid + ");'>Select this Location</a></strong>";
                    $.publish("/layers/addmarker", [{
                        "lon": data.rows[0].row.longitude,
                        "lat": data.rows[0].row.latitude,
                        "featuretype": "1",
                        "label": message
                    }]);
                }
            });
        }
    });
}

/*  Handle toolbar events  */

function toolbar(tool) {
    if (tool.attr("id") == "identify") {
        map.on('click', identify);
    } else map.off('click', identify);
}

/*
    Zoom to a latlong at a particular zoom level.
    If no zoom passed zoom level doesn't change, it just pans.
*/
function zoomToLonLat(data) {
    if (data.zoom) map.setView(new L.LatLng(parseFloat(data.lat), parseFloat(data.lon)), data.zoom);
}


/*
    Add markers to the map.
    The default rule here is 1 marker of each type at a time, but you could fiddle with that.
    You can add custom markers for each type.
*/
function addMarker(data) {

    var blueIcon = L.Icon.extend({
        iconUrl: './img/marker.png',
        shadowUrl: './img/marker-shadow.png'
    });
    var orangeIcon = L.Icon.extend({
        iconUrl: './img/marker2.png',
        shadowUrl: './img/marker-shadow.png'
    });
    var icons = [new blueIcon(), new orangeIcon()];

    if (null != markers[data.featuretype]) map.removeLayer(markers[data.featuretype]);
    markers[data.featuretype] = new L.Marker(new L.LatLng(parseFloat(data.lat), parseFloat(data.lon)), {
        icon: icons[data.featuretype]
    });
    map.addLayer(markers[data.featuretype]);

    markers[data.featuretype].bindPopup(data.label).openPopup();
}
