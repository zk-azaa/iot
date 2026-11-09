#define BLYNK_TEMPLATE_ID "TMPL6nYuXHViy"
#define BLYNK_TEMPLATE_NAME "esp"
#define BLYNK_AUTH_TOKEN "iSq-7rW22aLSC5cRUKMQIE1HSWKiaE2F"

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>

char ssid[] = "kos_bu_atun";
char pass[] = "berkahkoscemerlang11";

#define LED_PIN 2

BLYNK_WRITE(V0)
{
  int state = param.asInt();

  digitalWrite(LED_PIN, state);

  Serial.print("LED: ");
  Serial.println(state);
}

BLYNK_WRITE(V1)
{
  int state = param.asInt();

  Serial.println("===== V1 MASUK =====");

  Serial2.println(state);

  Serial.print("Arduino LED = ");
  Serial.println(state);
}


void setup()
{
  Serial.begin(115200);
  Serial2.begin(
    9600,
    SERIAL_8N1,
    16, //rx2
    17  //tx2
    );

  Serial.println("Mulai ESP32...");

  pinMode(LED_PIN, OUTPUT);

  Serial.println("Menghubungkan ke Blynk...");

  Blynk.begin(
    BLYNK_AUTH_TOKEN,
    ssid,
    pass
  );

  Serial.println("Terhubung!");
}

void loop()
{
  Blynk.run();
}