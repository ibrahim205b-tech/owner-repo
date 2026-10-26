package com.hajji.staff;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The restaurant's order screen. It shows the staff page of the website inside the app,
 * so orders, status changes and live alerts use the same code as the web.
 */
public class MainActivity extends Activity {

    // The staff page. Change this only if the website address changes.
    private static final String STAFF_URL = "https://ibrahim205b-tech.github.io/owner-repo/staff.html";
    private static final String SITE_HOST = "ibrahim205b-tech.github.io";
    private static final String BACKEND_SUFFIX = ".supabase.co";

    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep the screen on while the restaurant is taking orders.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // The new-order sound plays without the staff having to tap the screen first.
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals(SITE_HOST) || host.endsWith(BACKEND_SUFFIX))) {
                    return false; // stay inside the app
                }
                // Any other link opens in the phone's browser.
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        setContentView(webView);
        webView.loadUrl(STAFF_URL);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }
}
