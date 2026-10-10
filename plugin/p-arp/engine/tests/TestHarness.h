#pragma once

// Minimal dependency-free test harness (Catch2-like syntax), so the engine builds and tests
// without fetching anything. Swap for Catch2/doctest if the suite outgrows it.

#include <functional>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace parp_test
{

struct TestCase
{
    std::string name;
    std::function<void()> body;
};

inline std::vector<TestCase>& registry()
{
    static std::vector<TestCase> tests;
    return tests;
}

struct Registrar
{
    Registrar (const char* name, std::function<void()> body) { registry().push_back ({ name, std::move (body) }); }
};

struct Failure
{
    std::string message;
};

inline int& failedChecks()
{
    static int count = 0;
    return count;
}

template <typename A, typename B>
void checkEqual (const A& actual, const B& expected, const char* expr, const char* file, int line, bool fatal)
{
    if (actual == expected)
        return;
    std::ostringstream message;
    message << file << ":" << line << ": CHECK_EQ(" << expr << ") failed: got " << actual << ", expected " << expected;
    if (fatal)
        throw Failure { message.str() };
    std::cerr << "    " << message.str() << "\n";
    ++failedChecks();
}

inline void check (bool condition, const char* expr, const char* file, int line, bool fatal)
{
    if (condition)
        return;
    std::ostringstream message;
    message << file << ":" << line << ": CHECK(" << expr << ") failed";
    if (fatal)
        throw Failure { message.str() };
    std::cerr << "    " << message.str() << "\n";
    ++failedChecks();
}

inline int runAll()
{
    int failedTests = 0;
    for (const auto& test : registry())
    {
        const int before = failedChecks();
        try
        {
            test.body();
        }
        catch (const Failure& failure)
        {
            std::cerr << "    " << failure.message << "\n";
            ++failedChecks();
        }
        const bool passed = failedChecks() == before;
        std::cout << (passed ? "  ok   " : "  FAIL ") << test.name << "\n";
        if (! passed)
            ++failedTests;
    }
    std::cout << registry().size() - (size_t) failedTests << "/" << registry().size() << " tests passed\n";
    return failedTests == 0 ? 0 : 1;
}

} // namespace parp_test

#define PARP_CONCAT_INNER(a, b) a##b
#define PARP_CONCAT(a, b) PARP_CONCAT_INNER (a, b)

#define TEST_CASE(name)                                                                       \
    static void PARP_CONCAT (parpTest_, __LINE__)();                                          \
    static const parp_test::Registrar PARP_CONCAT (parpReg_, __LINE__) { name, PARP_CONCAT (parpTest_, __LINE__) }; \
    static void PARP_CONCAT (parpTest_, __LINE__)()

#define CHECK(expr) parp_test::check ((expr), #expr, __FILE__, __LINE__, false)
#define REQUIRE(expr) parp_test::check ((expr), #expr, __FILE__, __LINE__, true)
#define CHECK_EQ(actual, expected) parp_test::checkEqual ((actual), (expected), #actual ", " #expected, __FILE__, __LINE__, false)
#define REQUIRE_EQ(actual, expected) parp_test::checkEqual ((actual), (expected), #actual ", " #expected, __FILE__, __LINE__, true)
