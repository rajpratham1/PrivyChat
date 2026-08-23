# PrivyChat mobile: two-device QR test

This build uses QR as an actual encrypted text transport. It is intentionally
single-frame for now; each optical message is limited to 240 characters.

## Prepare the devices

1. Install Flutter 3.22.x, Dart, Android SDK 35 and JDK 17.
2. From `mobile/`, run `flutter pub get`.
3. Connect two physical phones and run the same debug build on both:
   `flutter run`.
4. Allow Camera permission when prompted. Keep both screens awake and set
   screen brightness high enough for the camera to read the QR code.

## Establish the air-gap session

1. On both phones enter different callsigns and enter the radar screen.
2. On Phone A choose **QR**, then leave **Show My Code** visible.
3. On Phone B choose **QR**, tap **Scan Camera**, and scan Phone A's code.
4. Phone B enters the chat. Send a short message (240 characters or fewer).
   The app opens **OPTICAL MESSAGE TRANSFER** and shows the encrypted message
   QR.
5. On Phone A, in the QR dialog that is still open, tap **Scan Camera** and
   scan Phone B's message QR. Phone A then enters the chat and decrypts it.
6. Continue alternating: the sender shows a message QR and the receiver scans
   it. Use the QR button in the chat header to scan a reply or show the
   session offer again.

If the message says that no secure session exists, repeat the offer scan. If
the camera does not detect a code, use the scanner tab, move the phones farther
apart, and keep the entire white QR square inside the camera preview.

## Relay (Wi-Fi) test

For normal live relay chat, both phones must use the same reachable Socket.IO
URL. The default Render URL can be unavailable or asleep. For a local test,
run `npm start` on a computer connected to the same Wi-Fi and enter that
computer's LAN URL, for example `http://192.168.1.100:3001`, on both phones.

The QR transport does not require internet, SIM data, a server, or Bluetooth.
The current mobile build is not yet compatible with BitChat's BLE packet and
multi-hop protocol; that is a separate transport phase.
