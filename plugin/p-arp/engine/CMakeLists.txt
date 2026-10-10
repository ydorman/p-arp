# p-arp engine: the arpeggiator itself, independent of JUCE and of any plugin format.
add_library(parp_engine STATIC
    src/Engine.cpp
    src/Progression.cpp
    src/Rates.cpp
    src/Sequence.cpp)

target_include_directories(parp_engine PUBLIC include)
target_compile_features(parp_engine PUBLIC cxx_std_20)

if (CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
    target_compile_options(parp_engine PRIVATE -Wall -Wextra -Wpedantic -Wshadow -Wconversion)
endif()
