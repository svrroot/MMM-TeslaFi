/* Magic Mirror
 * Module: MMM-TeslaFi
 *
 * Originally By Adrian Chrysanthou
 * Updated by Matt Dyson
 * MIT Licensed.
 */
Module.register("MMM-TeslaFi", {
  defaults: {
    units: config.units,
    animationSpeed: 1000,
    refreshInterval: 1000 * 60, //refresh every minute
    updateInterval: 1000 * 3600, //update every hour
    lang: config.language,
    initialLoadDelay: 0, // 0 seconds delay
    retryDelay: 2500,
    unitDistance: "miles",
    unitTemperature: "c",
    batteryDanger: 30,
    batteryWarning: 50,
    dataTimeout: 0,
    googleMapApiKey: "",
    mapZoom: 13,
    mapWidth: 300,
    mapHeight: 150,
    excludeLocations: [],
    homeAddress: "",
    googleApiBase:
      "https://maps.googleapis.com/maps/api/distancematrix/json?key=",
    precision: 1, // How many decimal places to round values to
    apiBase: "https://www.teslafi.com/feed.php?token=",
    apiQuery: "&command=lastGood",
    items: [
      "state",
      "speed",
      "heading",
      "battery",
      "range",
      "range-estimated",
      "power-connected",
      "charge-time",
      "charge-added",
      "charge-power",
      "locked",
      "odometer",
      "temperature",
      "map",
      "version",
      "newVersion",
      "location",
      "data-time"
    ]
  },
  // Define required scripts.
  getScripts: function () {
    return [
      "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.11/lodash.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.24.0/moment.min.js",
      "moment.js",
      this.file("DataItemProvider.js"),
      this.file("dataitems/battery.js"),
      this.file("dataitems/charge.js"),
      this.file("dataitems/driving.js"),
      this.file("dataitems/location.js"),
      this.file("dataitems/range.js"),
      this.file("dataitems/software.js"),
      this.file("dataitems/state.js"),
      this.file("dataitems/temperature.js")
    ];
  },
  getStyles: function () {
    return [
      "https://cdnjs.cloudflare.com/ajax/libs/material-design-iconic-font/2.2.0/css/material-design-iconic-font.min.css",
      "MMM-TeslaFi.css"
    ];
  },
  start: function () {
    Log.info("Starting module: " + this.name);
    this.loaded = false;
    this.sendSocketNotification("CONFIG", this.config);
    this.providers = [];

    for (var identifier in DataItemProvider.providers) {
      this.providers[identifier] = new DataItemProvider.providers[identifier](
        this
      );
    }
  },
  getDom: function () {
    var wrapper = document.createElement("div");
    if (!this.loaded) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "dimmed light small";
      return wrapper;
    }
    if (this.config.apiKey === "") {
      wrapper.innerHTML = "No Tesla Fi <i>apiKey</i> set in config file.";
      wrapper.className = "dimmed light small";
      return wrapper;
    }
    if (!this.data) {
      wrapper.innerHTML = "No data";
      wrapper.className = "dimmed light small";
      return wrapper;
    }
    var t = this.data;
    var content = document.createElement("div");

    content.innerHTML = "";
    var table = `
      <h2 class="mqtt-title"><span class="zmdi zmdi-car zmdi-hc-1x icon"></span> ${t.display_name}</h2>
      <table class="small">
		`;

    for (var index in this.config.items) {
      dataItem = this.config.items[index];

      if (!this.providers.hasOwnProperty(dataItem)) {
        Log.error("Could not find " + dataItem + " in list of valid providers");
        continue;
      }

      if (!this.providers[dataItem].display) {
        // This provider doesn't want us to display it right now, so skip
        Log.info(
          "Provider " + dataItem + " doesn't want to be shown right now"
        );
        continue;
      }

      var icon = this.providers[dataItem].icon;
      var field = this.providers[dataItem].field;
      var value = this.providers[dataItem].value;

      if (field === null && value === null) {
        table += `
          <tr>
            <td class="icon" colspan="3">${icon}</td>
          </tr>
        `;
      } else {
        var colspan = 1;
        if (value === null) {
          colspan = 2;
        }

        table += `
          <tr>
            <td class="icon">${icon}</td>
            <td class="field" colspan="${colspan}">${field}</td>
        `;
        if (value !== null) {
          table += `<td class="value">${value}</td>`;
        }
        table += `</tr>`;
      }
    } // end foreach loop of items

    table += "</table>";

    wrapper.innerHTML = table;
    wrapper.className = "light small";
    wrapper.appendChild(content);
    return wrapper;
  },
  socketNotificationReceived: function (notification, payload) {
    if (notification === "STARTED") {
      this.updateDom();
    } else if (notification === "DATA") {
      this.loaded = true;
      this.tFi(JSON.parse(payload));
    }
  },
  // tFi(data)
  // Uses the received data to set the various values.
  //argument data object - info from teslfi.com
  tFi: function (data) {
    if (!data) {
      // Did not receive usable new data.
      return;
    }
    this.data = data;
    this.loaded = true;

    // Tell all of our data item providers about the new data
    for (var identifier in this.providers) {
      this.providers[identifier].updateData(data);
    }

    // Update the DOM
    this.updateDom(this.config.animationSpeed);
  },
  // Return a number with the precision specified in our config
  numberFormat: function (number) {
    return parseFloat(number).toFixed(this.config.precision);
  },

  // Converts the given temperature (assumes C input) into the configured output, with appropriate units appended
  convertTemperature: function (valueC) {
    if (this.config.unitTemperature === "f") {
      var valueF = valueC * (9 / 5) + 32;
      return this.numberFormat(valueF) + "&deg;F";
    } else {
      return this.numberFormat(valueC) + "&deg;C";
    }
  },

  // Converts the given distance (assumes miles input) into the configured output, with appropriate units appended
  convertDistance: function (valueMiles) {
    if (this.config.unitDistance === "km") {
      var valueKm = valueMiles * 1.60934;
      return this.numberFormat(valueKm) + " km";
    } else {
      return this.numberFormat(valueMiles) + " miles";
    }
  },

  // Converts given speed (assumes miles input) to configured output with approprate units appened
  convertSpeed: function (valueMiles) {
    if (this.config.unitDistance === "km") {
      return this.numberFormat(valueMiles * 1.60934) + " km/h";
    } else {
      return this.numberFormat(valueMiles) + " mph";
    }
  },

  // Converts heading int to nearest bearing by 45deg
  convertHeading: function (heading) {
    const bearing = {
      0: "North",
      45: "North East",
      90: "East",
      135: "South East",
      180: "South",
      225: "South West",
      270: "West",
      315: "North West",
      360: "North"
    };
    const direction = (heading) => {
      return Object.keys(bearing)
        .map(Number)
        .reduce(function (prev, curr) {
          return Math.abs(curr - heading) < Math.abs(prev - heading)
            ? curr
            : prev;
        });
    };
    return bearing[direction(heading)];
  }
});
