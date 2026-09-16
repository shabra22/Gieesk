package com.gieesk.recipes;

import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Manually register GoogleAuth — this plugin's auto-detection metadata
        // hasn't been updated for this Capacitor version, so `npx cap sync`
        // doesn't find it on its own; registering it here makes it available
        // at window.Capacitor.Plugins.GoogleAuth as usual.
        registerPlugin(GoogleAuth.class);

        super.onCreate(savedInstanceState);

        // True edge-to-edge: let the app's content draw behind the status bar,
        // navigation bar, and camera cutout area, instead of the OS reserving
        // that space. Combined with BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE below,
        // the time/network/battery indicators stay hidden until the user swipes
        // down from the top edge, then automatically hide again afterward.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }

        // Let content extend into the camera cutout/notch area on phones that
        // have one, rather than leaving a black bar around it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    /**
     * Forwards hardware volume key presses into the web layer as a normal DOM
     * event. JavaScript in a WebView has no way to observe these on its own —
     * this is the native bridge that makes "press volume up to unmute" possible
     * in the app (it genuinely isn't possible in a plain browser).
     *
     * Deliberately returns super.onKeyDown(...) rather than consuming the
     * event, so Android still adjusts the actual system volume exactly as
     * usual — this only piggybacks on the press as a signal.
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            final String direction = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "up" : "down";
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('gieesk:volumeKey',"
                                    + "{detail:{direction:'" + direction + "'}}));",
                            null);
                }
            } catch (Exception e) {
                // Never let a web-layer problem interfere with the volume
                // control itself — fall through to normal system handling.
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}