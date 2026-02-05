# Keurig My K-Cup Coffee Grinder Scale

<img width="1833" height="1520" alt="image" src="https://github.com/user-attachments/assets/9acc6422-d844-4cc1-b14d-251ccca084d5" />

An IoT scale &amp; web UI for a scale to automatically grind &amp; dispense the desired amount of coffee into a Keurig My K-Cup™.

To make this work, you need an ESP32, a load cell with an HX711 ADC, and a relay that can be driven by the ESP32 board.

I used an Elegoo ESP32 board that is compatible with the Arduino IDE where it's called DOIT ESP32 DEVKIT V1.

You have to install this type of board in the IDE before you can compile and upload the sketch to the board.

The IO pins and WiFi SSID/password are described inside the sketch.
The ESP32 will run a WiFi access point and a web server, defaulting to **192.168.4.1**.

The web server hosts a few endpoints:
* GET /
* GET /js
* GET /adcCount
* GET /config
* POST /submit/html
* POST /submit/js
* GET /flash
* PUT /switch/on
* PUT /switch/off

See app.js how these are used.
GET /config will let you upload new HTML or JavaScript. The limit is 3000 bytes, so I used uglifyjs to shrink the JS file before uploading.
GET /flash will erase the ESP32 flash memory if you ever have problems getting /config to save your JS or HTML changes.

Simply connect your device to the AP called **Angle of the \~Dangle\~**, password **12345678**, and see the scale in action.
