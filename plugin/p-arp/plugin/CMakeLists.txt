# p-arp JUCE plugin shell: AU MIDI FX wrapping the engine, with the React web UI.

juce_add_plugin(ParpPlugin
    COMPANY_NAME "p-arp"
    BUNDLE_ID com.ydorman.p-arp
    # Logic projects refer to the plugin by these codes: keep them stable
    PLUGIN_MANUFACTURER_CODE Ydrm
    PLUGIN_CODE Parp
    FORMATS AU
    PRODUCT_NAME "p-arp"
    VERSION ${PROJECT_VERSION}
    IS_MIDI_EFFECT TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT TRUE
    IS_SYNTH FALSE
    AU_MAIN_TYPE kAudioUnitType_MIDIProcessor
    NEEDS_WEB_BROWSER TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE)

# ---------------------------------------------------------------------------------------------
# Web UI: `npm run build` in ui/, zip the output, embed the zip as binary data.
# Requires `npm install` in ui/ once.
# ---------------------------------------------------------------------------------------------
set(PARP_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../ui")
set(PARP_UI_ZIP "${CMAKE_CURRENT_BINARY_DIR}/ui.zip")
file(GLOB_RECURSE PARP_UI_SOURCES CONFIGURE_DEPENDS
    "${PARP_UI_DIR}/src/*"
    "${PARP_UI_DIR}/index.html"
    "${PARP_UI_DIR}/package.json"
    "${PARP_UI_DIR}/vite.config.ts")
find_program(PARP_NPM npm REQUIRED)

add_custom_command(
    OUTPUT "${PARP_UI_ZIP}"
    COMMAND "${PARP_NPM}" run build
    COMMAND "${CMAKE_COMMAND}" -E rm -f "${PARP_UI_ZIP}"
    COMMAND "${CMAKE_COMMAND}" -E chdir "${PARP_UI_DIR}/dist"
            "${CMAKE_COMMAND}" -E tar cf "${PARP_UI_ZIP}" --format=zip index.html assets
    WORKING_DIRECTORY "${PARP_UI_DIR}"
    DEPENDS ${PARP_UI_SOURCES}
    COMMENT "Building p-arp web UI"
    VERBATIM)

juce_add_binary_data(ParpUI SOURCES "${PARP_UI_ZIP}")

target_sources(ParpPlugin
    PRIVATE
        Source/PluginProcessor.cpp
        Source/PluginEditor.cpp)

target_compile_definitions(ParpPlugin
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0)

if (PARP_UI_DEV_SERVER)
    target_compile_definitions(ParpPlugin PRIVATE PARP_UI_DEV_URL="http://localhost:5173/")
endif()

target_link_libraries(ParpPlugin
    PRIVATE
        parp_engine
        ParpUI
        juce::juce_audio_utils
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)
