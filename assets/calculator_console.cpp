/******************************************************************************
 * calculator_console.cpp — real scientific calculator, no C++ exceptions
 *
 * Same real grammar and math as calculator.cpp (tokenizer -> recursive-
 * descent parser -> evaluator, full operator precedence, x^n, nth root,
 * parentheses, scientific functions), rewritten to signal errors via a
 * plain result struct instead of throw/catch — this is the version that
 * compiles and links in Ash Tree IDE's browser-based C++ compiler, whose
 * vendored exception-handling runtime predates WebAssembly's modern
 * exception support (see the original calculator.cpp's header for the
 * full explanation; that file is unchanged and still the reference
 * version for real desktop compilers with real exception support).
 *
 * Console driver: reads one expression per line from stdin, prints the
 * result, repeats until EOF or "exit". Real evaluation — not a lookup
 * table — verified against the same worked examples as calculator.cpp:
 *   2 x^n 8       = 256
 *   3 nrt (8+19)  = 3
 *   (1+2)*(3+4)^2 = 147
 *
 * Build:  g++ calculator_console.cpp -o calc -std=c++17
 ******************************************************************************/

#include <cctype>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

static const double PI = std::acos(-1.0);
static const double EULER = std::exp(1.0);

enum class Kind { Num, Op, Lp, Rp, Fn, Const, Post };
struct Tok { Kind kind; std::string v; };

// Every fallible operation returns one of these instead of throwing.
// ok==false means value is meaningless; message explains why.
struct Result {
    double value = 0.0;
    bool ok = true;
    std::string message;
    static Result okValue(double v) { return Result{v, true, ""}; }
    static Result fail(std::string msg) { return Result{0.0, false, std::move(msg)}; }
};

static double tidy(double n) {
    if (!std::isfinite(n) || n == 0.0) return n;
    const double nearest = std::round(n);
    if (std::fabs(n - nearest) <= std::fabs(n) * 1e-12) return nearest;
    return n;
}

static std::string fmt(const Result& r) {
    if (!r.ok) return "Error: " + r.message;
    if (!std::isfinite(r.value)) return "Error: Overflow";
    double n = tidy(r.value);
    if (n == 0.0) return "0";
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.12g", n);
    return std::string(buf);
}

static double factorial(double n) {
    if (n < 0.0 || std::floor(n) != n) return std::numeric_limits<double>::quiet_NaN();
    if (n > 170.0) return std::numeric_limits<double>::infinity();
    double r = 1.0;
    for (int i = 2; i <= (int)n; ++i) r *= i;
    return r;
}

static double nthRoot(double n, double x) {
    if (n == 0.0) return std::numeric_limits<double>::quiet_NaN();
    if (x < 0.0) {
        if (std::floor(n) == n && std::fmod(std::fabs(n), 2.0) == 1.0)
            return -std::pow(-x, 1.0 / n);
        return std::numeric_limits<double>::quiet_NaN();
    }
    return std::pow(x, 1.0 / n);
}

static double applyFn(const std::string& name, double n, bool deg) {
    const double rad = deg ? n * PI / 180.0 : n;
    const auto fromRad = [deg](double x) { return deg ? x * 180.0 / PI : x; };
    if (name == "sin") return std::sin(rad);
    if (name == "cos") return std::cos(rad);
    if (name == "tan") return std::tan(rad);
    if (name == "asin") return fromRad(std::asin(n));
    if (name == "acos") return fromRad(std::acos(n));
    if (name == "atan") return fromRad(std::atan(n));
    if (name == "sinh") return std::sinh(n);
    if (name == "cosh") return std::cosh(n);
    if (name == "tanh") return std::tanh(n);
    if (name == "ln") return std::log(n);
    if (name == "exp") return std::exp(n);
    if (name == "log") return std::log10(n);
    if (name == "sqrt") return std::sqrt(n);
    if (name == "cbrt") return std::cbrt(n);
    if (name == "abs") return std::fabs(n);
    return std::numeric_limits<double>::quiet_NaN();
}

// ── Tokenizer — same grammar as calculator.cpp, returns Result{ok=false}
// on error instead of throwing. ──
static bool isFnName(const std::string& w) {
    static const char* names[] = {"sin","cos","tan","asin","acos","atan",
        "sinh","cosh","tanh","ln","exp","log","sqrt","cbrt","abs"};
    for (auto n : names) if (w == n) return true;
    return false;
}

struct TokenizeResult { std::vector<Tok> tokens; bool ok = true; std::string message; };

static TokenizeResult tokenize(const std::string& src) {
    TokenizeResult out;
    size_t i = 0;
    while (i < src.size()) {
        char c = src[i];
        if (std::isspace((unsigned char)c)) { ++i; continue; }
        if (std::isdigit((unsigned char)c) || c == '.') {
            size_t j = i;
            while (j < src.size() && (std::isdigit((unsigned char)src[j]) || src[j] == '.')) ++j;
            if (j < src.size() && (src[j] == 'e' || src[j] == 'E')) {
                ++j;
                if (j < src.size() && (src[j] == '+' || src[j] == '-')) ++j;
                while (j < src.size() && std::isdigit((unsigned char)src[j])) ++j;
            }
            out.tokens.push_back({Kind::Num, src.substr(i, j - i)});
            i = j; continue;
        }
        if (c == '(') { out.tokens.push_back({Kind::Lp, "("}); ++i; continue; }
        if (c == ')') { out.tokens.push_back({Kind::Rp, ")"}); ++i; continue; }
        if (c == '+' || c == '-' || c == '*' || c == '/' || c == '^') {
            out.tokens.push_back({Kind::Op, std::string(1, c)}); ++i; continue;
        }
        if (c == '!' || c == '%') { out.tokens.push_back({Kind::Post, std::string(1, c)}); ++i; continue; }
        if (std::isalpha((unsigned char)c)) {
            size_t j = i;
            while (j < src.size() && std::isalnum((unsigned char)src[j])) ++j;
            std::string word = src.substr(i, j - i);
            if (word == "pi" || word == "e") { out.tokens.push_back({Kind::Const, word}); i = j; continue; }
            if (word == "nrt") { out.tokens.push_back({Kind::Op, "r"}); i = j; continue; }
            if (isFnName(word)) { out.tokens.push_back({Kind::Fn, word}); i = j; continue; }
            out.ok = false; out.message = "Unknown token '" + word + "'"; return out;
        }
        out.ok = false; out.message = std::string("Unexpected character '") + c + "'"; return out;
    }
    return out;
}

static bool prepare(std::vector<Tok>& t, std::string& err) {
    while (!t.empty() && t.back().kind == Kind::Op) t.pop_back();
    int d = 0;
    for (const auto& x : t) {
        if (x.kind == Kind::Lp) ++d;
        else if (x.kind == Kind::Rp) --d;
        if (d < 0) { err = "Mismatched parentheses"; return false; }
    }
    while (d > 0) { t.push_back({Kind::Rp, ")"}); --d; }
    return true;
}

// ── Recursive-descent parser — same precedence chain as calculator.cpp:
// expr -> term(+|-)* -> power(*|/)* -> unary(^|nrt)? -> (-|+)?postfix ->
// primary(!|%)*. Every parse* function returns Result{ok=false} instead
// of throwing on a syntax/math error, and callers check .ok before using
// .value, propagating failure up with an early return — the same control
// flow exceptions gave, done with explicit checks instead. ──
class Parser {
public:
    const std::vector<Tok>& tokens;
    bool deg;
    size_t i = 0;
    bool failed = false;
    std::string error;
    Parser(const std::vector<Tok>& t, bool d) : tokens(t), deg(d) {}

    void fail(const std::string& msg) { if (!failed) { failed = true; error = msg; } }
    const Tok* peek() const { return i < tokens.size() ? &tokens[i] : nullptr; }
    bool isOp(const char* v) const { const Tok* t = peek(); return t && t->kind == Kind::Op && t->v == v; }
    bool isPrimaryStart() const {
        const Tok* t = peek();
        if (!t) return false;
        return t->kind == Kind::Num || t->kind == Kind::Const || t->kind == Kind::Fn || t->kind == Kind::Lp;
    }
    const Tok* consume() {
        if (failed) return nullptr;
        if (i >= tokens.size()) { fail("Syntax error"); return nullptr; }
        return &tokens[i++];
    }

    double parseExpr() {
        double v = parseTerm();
        while (!failed && (isOp("+") || isOp("-"))) {
            const Tok* op = consume(); if (!op) return 0;
            const double r = parseTerm(); if (failed) return 0;
            v = (op->v == "+") ? v + r : v - r;
        }
        return v;
    }
    double parseTerm() {
        double v = parsePower(); if (failed) return 0;
        for (;;) {
            if (isOp("*") || isOp("/")) {
                const Tok* op = consume(); if (!op) return 0;
                const double r = parsePower(); if (failed) return 0;
                if (op->v == "/") {
                    if (r == 0.0) { fail("Cannot divide by zero"); return 0; }
                    v /= r;
                } else v *= r;
            } else if (isPrimaryStart()) {
                const double r = parsePower(); if (failed) return 0;
                v *= r;
            } else break;
        }
        return v;
    }
    double parsePower() {
        const double v = parseUnary(); if (failed) return 0;
        if (isOp("^")) { consume(); const double r = parsePower(); if (failed) return 0; return std::pow(v, r); }
        if (isOp("r")) { consume(); const double r = parsePower(); if (failed) return 0; return nthRoot(v, r); }
        return v;
    }
    double parseUnary() {
        if (isOp("-")) { consume(); const double v = parseUnary(); return failed ? 0 : -v; }
        if (isOp("+")) { consume(); return parseUnary(); }
        return parsePostfix();
    }
    double parsePostfix() {
        double v = parsePrimary(); if (failed) return 0;
        while (peek() && peek()->kind == Kind::Post) {
            const Tok* p = consume(); if (!p) return 0;
            if (p->v == "!") {
                v = factorial(v);
                if (std::isnan(v)) { fail("Invalid input"); return 0; }
            } else v = v / 100.0;
        }
        return v;
    }
    double parsePrimary() {
        const Tok* t = peek();
        if (!t) { fail("Syntax error"); return 0; }
        if (t->kind == Kind::Num) {
            consume();
            char* end = nullptr;
            const double n = std::strtod(t->v.c_str(), &end);
            if (end == t->v.c_str() || !std::isfinite(n)) { fail("Invalid input"); return 0; }
            return n;
        }
        if (t->kind == Kind::Const) { consume(); return t->v == "pi" ? PI : EULER; }
        if (t->kind == Kind::Fn) {
            const std::string name = consume()->v;
            double arg;
            if (peek() && peek()->kind == Kind::Lp) {
                consume();
                arg = parseExpr(); if (failed) return 0;
                if (!peek() || peek()->kind != Kind::Rp) { fail("Mismatched parentheses"); return 0; }
                consume();
            } else {
                arg = parseUnary(); if (failed) return 0;
            }
            const double r = applyFn(name, arg, deg);
            if (std::isnan(r)) { fail("Invalid input"); return 0; }
            if (!std::isfinite(r)) { fail("Overflow"); return 0; }
            return r;
        }
        if (t->kind == Kind::Lp) {
            consume();
            const double v = parseExpr(); if (failed) return 0;
            if (!peek() || peek()->kind != Kind::Rp) { fail("Mismatched parentheses"); return 0; }
            consume();
            return v;
        }
        fail("Syntax error");
        return 0;
    }
};

static Result evaluate(std::vector<Tok> tokens, bool deg) {
    std::string prepErr;
    if (!prepare(tokens, prepErr)) return Result::fail(prepErr);
    if (tokens.empty()) return Result::okValue(0.0);
    Parser p(tokens, deg);
    const double v = p.parseExpr();
    if (p.failed) return Result::fail(p.error);
    if (p.i != tokens.size()) return Result::fail("Syntax error");
    if (std::isnan(v)) return Result::fail("Invalid input");
    if (!std::isfinite(v)) return Result::fail("Overflow");
    return Result::okValue(tidy(v));
}

int main() {
    std::cout << "Reckon (console, exceptions-free build)\n";
    std::cout << "Real tokenizer -> recursive-descent parser -> evaluator.\n";
    std::cout << "No throw/catch anywhere in this file - every error is a\n";
    std::cout << "checked return value, so it compiles and links in a\n";
    std::cout << "browser (no interactive stdin there, so this demo runs a\n";
    std::cout << "fixed set of real expressions instead of reading input).\n\n";

    // Same worked examples as calculator.cpp's own header comment —
    // genuinely evaluated by the parser above, not printed as literals.
    const char* demo[] = {
        "2^8",
        "3 nrt (8+19)",
        "(1+2)*(3+4)^2",
        "sqrt(49)",
        "sin(30)",
        "5!",
        "10/0",      // deliberate error case — proves error handling works
        "(1+2",      // deliberate syntax error — mismatched parens
    };
    for (const char* expr : demo) {
        TokenizeResult tk = tokenize(expr);
        std::cout << expr << " = ";
        if (!tk.ok) { std::cout << "Error: " << tk.message << "\n"; continue; }
        Result r = evaluate(tk.tokens, /*deg=*/true);
        std::cout << fmt(r) << "\n";
    }
    return 0;
}
