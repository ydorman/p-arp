add_executable(parp_engine_tests
    test_main.cpp
    EngineTests.cpp
    ProgressionTests.cpp
    SequenceTests.cpp
    SchedulerTests.cpp
    ParameterTests.cpp
    EventLogTests.cpp
    LiveNoteTests.cpp
    PresetTests.cpp)

target_link_libraries(parp_engine_tests PRIVATE parp_engine)
target_compile_definitions(parp_engine_tests PRIVATE PARP_PRESETS_DIR="${CMAKE_SOURCE_DIR}/presets")

add_test(NAME parp_engine_tests COMMAND parp_engine_tests)

# The UI's parameter list is generated from the engine's table: fail if the committed copy is stale
add_executable(parp_dump_parameters ../tools/dump_parameters.cpp)
target_link_libraries(parp_dump_parameters PRIVATE parp_engine)
set_target_properties(parp_dump_parameters PROPERTIES RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/engine/tools")
add_test(NAME ui_parameters_json_up_to_date
         COMMAND ${CMAKE_COMMAND} -DDUMP=$<TARGET_FILE:parp_dump_parameters>
                 -DEXPECTED=${CMAKE_SOURCE_DIR}/ui/src/params/parameters.json
                 -P ${CMAKE_CURRENT_SOURCE_DIR}/CompareParameters.cmake)
