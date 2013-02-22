#Mecklenburg County GeoPortal

Mecklenburg County GeoPortal is the current production release of Mecklenburg County's version of the [Geoportal Project](https://github.com/tobinbradley/GeoPortal-Project). It leverages the great work of the following projects:
* [Leaflet](http://leaflet.cloudmade.com/)
* [OpenLayers](http://openlayers.org/)
* [HTML5 Boilerplate](http://html5boilerplate.com/)
* [jQuery](http://jquery.com/)
* [jQuery UI](http://jqueryui.com/)

## Getting Started
This app uses no server-side code. Fling it on any http server and it should start working.

You can select Leaflet or OpenLayers in __index.html__ via commenting or uncommenting the script sections at the bottom.

<pre>
    <!-- Mapping Library - Leaflet -->
    <script src="http://cdn.leafletjs.com/leaflet-0.5.1/leaflet.js"></script>
    <script src="js/map-leaflet.js"></script>

    <!-- Mapping Library - OpenLayers -->
    <!-- For deployment you should really host the OpenLayers Library locally so an OpenLayers upgrade  doesn't break your stuff. -->
    <!--<script src="http://openlayers.org/api/OpenLayers.js"></script>
    <script src="js/map-openlayers.js"></script>-->
</pre>

Map configuration - map starting position and layers - can be found in __js/config.js__. Most of the object properties should be self-explanatory with the exception of _web_service_base_. This property is the base URL for your HTTP API calls for things like searches, geoprocessing, etc. You can use whatever you like here. The calls are currently using the [postgis-restful-web-service-framework](http://code.google.com/p/postgis-restful-web-service-framework/). If you just need a map, you can ignore this.


