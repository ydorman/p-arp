cmake_minimum_required(VERSION 3.22)

project(P_ARP VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(PARP_BUILD_PLUGIN "Build the JUCE AU plugin (fetches JUCE)" ON)
option(PARP_BUILD_TESTS "Build the engine unit tests" ON)
option(PARP_UI_DEV_SERVER "Load the UI from the Vite dev server (hot reload) instead of the bundled build" OFF)

# The engine is plain C++ with no JUCE dependency, so it can be built and tested on its own:
#   cmake -B build-tests -DPARP_BUILD_PLUGIN=OFF && cmake --build build-tests && ctest --test-dir build-tests
add_subdirectory(engine)

if (PARP_BUILD_TESTS)
    enable_testing()
    add_subdirectory(engine/tests)
endif()

if (PARP_BUILD_PLUGIN)
    include(FetchContent)
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        8.0.15
        GIT_SHALLOW    TRUE)
    FetchContent_MakeAvailable(JUCE)
    add_subdirectory(plugin)
endif()
