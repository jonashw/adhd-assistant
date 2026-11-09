plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.jonashw.adhdassist.listen"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.jonashw.adhdassist.listen"
        // createOnDeviceSpeechRecognizer needs Android 12; segmented sessions need 13
        minSdk = 31
        targetSdk = 35
        versionCode = 3
        versionName = "0.3"
    }

    // A fixed key, committed on purpose: it guards nothing, and it lets each new build install over the last
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("listen-test.keystore")
            storePassword = "listentest"
            keyAlias = "listentest"
            keyPassword = "listentest"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}
