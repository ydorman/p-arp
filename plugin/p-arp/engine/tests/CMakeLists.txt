add_executable(parp_engine_tests
    test_main.cpp
    EngineTests.cpp)

target_link_libraries(parp_engine_tests PRIVATE parp_engine)

add_test(NAME parp_engine_tests COMMAND parp_engine_tests)
