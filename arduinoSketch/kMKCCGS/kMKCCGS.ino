#include <nvs_flash.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiAP.h>
#include <NetworkClient.h>

#define SERIAL_OUT   //Serial.print
#define SERIAL_OUTLN //Serial.println
#define HX711_PD_SCK 4
#define HX711_DOUT   5
#define SSR_EN       2
#define PREF_BUF_LEN 3000

#define W_SSID "Angle Of The ~Dangle~"
#define W_PASS "12345678"

#define SVR_FORM "<html><body><textarea id=html rows=10 cols=100 maxlength=3000></textarea><br><script>function submitField(id){var xhr=new XMLHttpRequest();xhr.onreadystatechange=()=>{if(xhr.readyState!==4)return;document.location='/'};xhr.open('POST','/submit/'+id,true);xhr.send(document.getElementById(id).value)}document.getElementById('html').focus();</script><button onclick=\"submitField('html')\">Submit HTML</button><br><textarea id=js rows=10 cols=100 maxlength=3000></textarea><br><button onclick=\"submitField('js')\">Submit JS</button><br><hr><br><textarea rows=3 cols=100>"

Preferences   prefs;
NetworkServer server(80);

void setup() {
	// Serial
	Serial.begin(115200);

	// HX711
	// https://www.digikey.com/htmldatasheets
	// /production/1836471/0/0/1/hx711.html
	pinMode(HX711_PD_SCK, OUTPUT);
	pinMode(HX711_DOUT, INPUT_PULLDOWN);
	digitalWrite(HX711_PD_SCK, HIGH);
	delayMicroseconds(100);
	digitalWrite(HX711_PD_SCK, LOW);
	SERIAL_OUTLN("HX711 reset");

	// SSR
	// https://www.slideshare.net/slideshow
	// /mgr-1-d4840-huimultd/168949900
	pinMode(SSR_EN, OUTPUT);
	digitalWrite(SSR_EN, LOW);

	// WiFi AP mode from Examples
	if (!WiFi.softAP(W_SSID, W_PASS)) {
		log_e("Soft AP creation failed.");
		while (true);
	}
	IPAddress myIP = WiFi.softAPIP();
	SERIAL_OUT("AP IP address: ");
	SERIAL_OUTLN(myIP);

	// HTTP NetworkServer adapted from Examples
	server.begin();
	SERIAL_OUTLN("Server started");

	// prefs to load basic config form
	prefs.begin("wifiScale", false);
	if (!prefs.isKey("html")) {
		SERIAL_OUTLN("no \"html\" pref.");
		prefs.putBytes("html", SVR_FORM, strlen(SVR_FORM));
		SERIAL_OUTLN("html saved.");
	} else {
		SERIAL_OUTLN("\"html\" pref found");
	}
}

void loop() {
	NetworkClient client = server.accept();
	if (!client) return;

	String requestLine = "";
	char   prefByteBuf[PREF_BUF_LEN];
	int    prefByteBufPos = 0;
	int    route = 0;
	bool   isPostRequest = false;
	bool   headersReceived = false;
	uint   contentLength = 0;
	size_t prefByteCount = 0;
	for (int i = 0; i < PREF_BUF_LEN; i++) {
		prefByteBuf[i] = ' ';
	}

	while (client.connected()) {
		if (!client.available()) continue;

		char c = client.read();
		SERIAL_OUT(c);

		if (!headersReceived) {
			bool cont = false;
			cont = headerStuff(c, &requestLine, &headersReceived, &contentLength, &route, &isPostRequest);
			if (headersReceived && !isPostRequest) break;
			if (cont) continue;
		}

		requestLine += c;

		if (headersReceived && isPostRequest) {
			prefByteBuf[prefByteBufPos++] = c;
			if (prefByteBufPos == contentLength)
				// all bytes received
				break;
		}
	}

	// request is done
	switch (route) {
		case 1:
			// GET /
			prefs.getBytes("html", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.print("Content-Length: ");
			client.println(PREF_BUF_LEN);
			client.println();
			client.write(prefByteBuf, PREF_BUF_LEN);
			break;
		case 2:
			// GET /js
			prefs.getBytes("js", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/javascript");
			client.print("Content-Length: ");
			client.println(PREF_BUF_LEN);
			client.println();
			client.write(prefByteBuf, PREF_BUF_LEN);
			break;
		case 3:
			// GET /adcCount
			char adcJson[32];
			snprintf(adcJson, sizeof adcJson, "{\"adcCount\":%d}", readAdcCount());
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: application/json");
			client.print("Content-Length: ");
			client.println(strlen(adcJson));
			client.println();
			client.print(adcJson);
			break;
		case 4:
			// GET /config
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			client.println(SVR_FORM);
			client.println("HTML:");
			prefs.getBytes("html", prefByteBuf, PREF_BUF_LEN);
			client.write(prefByteBuf, PREF_BUF_LEN);
			client.println("JS:");
			prefs.getBytes("js", prefByteBuf, PREF_BUF_LEN);
			client.write(prefByteBuf, PREF_BUF_LEN);
			break;
		case 5:
			// POST /submit/html
			SERIAL_OUTLN(prefByteBuf);
			prefByteCount = prefs.putBytes("html", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			client.println(prefByteCount);
			break;
		case 6:
			// POST /submit/js
			SERIAL_OUTLN(prefByteBuf);
			prefByteCount = prefs.putBytes("js", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			client.println(prefByteCount);
			break;
		case 7:
			// /flash
			Serial.println(">>> FLASHING NVS... <<<");
			nvs_flash_erase();
			nvs_flash_init();
			Serial.println(">>> DONE FLASHING. <<<");
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			break;
		case 8:
			// /switch/on
			Serial.println("switching SSR ON");
			digitalWrite(SSR_EN, HIGH);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			break;
		case 9:
			// /switch/off
			Serial.println("switching SSR OFF");
			digitalWrite(SSR_EN, LOW);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			break;
		case 10:
			// GET /settings
			prefByteCount = prefs.getBytes("settings", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: application/json");
			client.print("Content-Length: ");
			client.println(prefByteCount > 0 ? PREF_BUF_LEN : 2);
			client.println();
			if (prefByteCount > 0)
				client.write(prefByteBuf, PREF_BUF_LEN);
			else
				client.println("{}");
			break;
		case 11:
			// POST /settings
			SERIAL_OUTLN(prefByteBuf);
			prefByteCount = prefs.putBytes("settings", prefByteBuf, PREF_BUF_LEN);
			client.println("HTTP/1.1 200 OK");
			client.println("Content-Type: text/html");
			client.println();
			client.println(prefByteCount);
			break;
	}
	client.stop();
}

bool headerStuff(char c, String* requestLine, bool* headersReceived,
		uint* contentLength, int* route, bool* isPostRequest) {
	if ((*requestLine).endsWith("GET /")) {
		*route = 1;
	} else if ((*requestLine).endsWith("GET /js")) {
		*route = 2;
	} else if ((*requestLine).endsWith("GET /adcCount")) {
		*route = 3;
	} else if ((*requestLine).endsWith("GET /config")) {
		*route = 4;
	} else if ((*requestLine).endsWith("POST /submit/html")) {
		*route = 5;
		*isPostRequest = true;
	} else if ((*requestLine).endsWith("POST /submit/js")) {
		*route = 6;
		*isPostRequest = true;
	} else if ((*requestLine).endsWith("GET /flash")) {
		*route = 7;
	} else if ((*requestLine).endsWith("PUT /switch/on")) {
		*route = 8;
	} else if ((*requestLine).endsWith("PUT /switch/off")) {
		*route = 9;
	} else if ((*requestLine).endsWith("GET /settings")) {
		*route = 10;
	} else if ((*requestLine).endsWith("POST /settings")) {
		*route = 11;
	}

	if (c == '\r') {
		// "continue" while loop, read the nest request byte
		return true;
	}

	if (c == '\n' && (*requestLine).startsWith("Content-Length")) {
		// store any request content (request body) length
		*contentLength = getDigits(requestLine);
	}

	if (c == '\n' && (*requestLine).length() > 0) {
		// move on to next header line
		*requestLine = "";
		// "continue" while loop, read the nest request byte
		return true;
	}

	if (c == '\n' && (*requestLine).length() == 0) {
		// headers received,
		// change request mode
		*headersReceived = true;
		// "continue" while loop, read the nest request byte
		return true;
	}

	// keep going & add the request byte to requestLine
	return false;
}

uint getDigits(String* s) {
	SERIAL_OUT("getDigits() of ");
	SERIAL_OUTLN(*s);
	uint val = 0;
	for (int i = 0; i < (*s).length(); i++) {
		if ((*s).charAt(i) < 48 || (*s).charAt(i) > 57)
			continue;
		val = val * 10 + (*s).charAt(i) - 48;
		SERIAL_OUTLN(val);
	}
	return val;
}

int readAdcCount() {
	int bit;
	int twosComp24b = 0x00000000;

	// until ready
	while (digitalRead(HX711_DOUT) == HIGH) {
		delayMicroseconds(1);
	}

	for (int i = 0; i < 24; i++) {
		digitalWrite(HX711_PD_SCK, HIGH);
		delayMicroseconds(2);
		bit = digitalRead(HX711_DOUT);
		digitalWrite(HX711_PD_SCK, LOW);
		delayMicroseconds(2);
		// first bit HIGH => NEGATIVE 2's complement so pad with ones
		if (i == 0 && bit == HIGH) twosComp24b = 0xFF000000;
		twosComp24b |= bit << (23 - i);
	}
	digitalWrite(HX711_PD_SCK, HIGH);
	delayMicroseconds(2);
	digitalWrite(HX711_PD_SCK, LOW);
	return twosComp24b;
}
