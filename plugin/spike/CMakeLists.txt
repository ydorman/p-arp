cmake_minimum_required(VERSION 3.22)

project(SARP_SPIKE VERSION 0.0.1)

# JUCE is pinned and fetched into the build folder (no dependency on a local install)
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        8.0.15
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(SarpSpike
    COMPANY_NAME "SARP"
    BUNDLE_ID com.ydorman.sarpspike
    PLUGIN_MANUFACTURER_CODE Sarp
    PLUGIN_CODE Srps
    FORMATS AU
    PRODUCT_NAME "SARP Spike"
    # AU MIDI FX: shows up in Logic's MIDI FX slot, MIDI in -> MIDI out, no audio
    IS_MIDI_EFFECT TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_SYNTH FALSE
    AU_MAIN_TYPE kAudioUnitType_MIDIProcessor
    NEEDS_WEB_BROWSER TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE)

# Web UI files, bundled into the plugin binary and served to the web view from memory.
# JUCE's JavaScript bridge library is copied in from the fetched JUCE sources.
set(JUCE_JS_DIR "${juce_SOURCE_DIR}/modules/juce_gui_extra/native/javascript")
file(COPY "${JUCE_JS_DIR}/" DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/ui-juce")
file(GLOB JUCE_JS_FILES "${CMAKE_CURRENT_BINARY_DIR}/ui-juce/*.js")

juce_add_binary_data(SarpSpikeUI
    SOURCES
        ui/index.html
        ui/app.js
        ui/style.css
        ${JUCE_JS_FILES})

target_sources(SarpSpike
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp)

target_compile_definitions(SarpSpike
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(SarpSpike
    PRIVATE
        SarpSpikeUI
        juce::juce_audio_utils
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)
