# Runs the parameter dump tool and compares its output with the committed UI copy
execute_process(COMMAND ${DUMP} OUTPUT_VARIABLE actual RESULT_VARIABLE result)
if (NOT result EQUAL 0)
    message(FATAL_ERROR "parp_dump_parameters failed")
endif()
file(READ ${EXPECTED} expected)
if (NOT actual STREQUAL expected)
    message(FATAL_ERROR "ui/src/params/parameters.json is out of date with the engine's parameter table. Regenerate:\n  ./build-tests/engine/tools/parp_dump_parameters > ui/src/params/parameters.json")
endif()
