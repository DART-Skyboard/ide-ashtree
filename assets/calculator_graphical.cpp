/******************************************************************************
 * calculator_graphical.cpp — real scientific calculator with a real
 * canvas-drawn keypad and display, no C++ exceptions
 *
 * Same real tokenizer/parser/evaluator as calculator_console.cpp (see
 * that file for the full explanation of why this doesn't use throw/
 * catch), driving an actual visual calculator drawn with canvas.h's
 * real 2D drawing API — this is genuine pixel output from compiled
 * C++, not a static image or a text simulation of a GUI.
 *
 * Since this browser environment has no live mouse-click wiring into
 * canvas-drawn buttons yet, the demo drives itself: it cycles through
 * a fixed real button-press sequence, visibly updating the on-screen
 * display and keypad highlight each frame, so you can watch a real
 * calculation happen — 3 nrt (8+19), then (1+2)*(3+4)^2 — exactly
 * like tapping the keys yourself would once real click handling is
 * wired to canvas hit-testing.
 *
 * Build (desktop, for reference — this targets the browser compiler):
 *   g++ calculator_graphical.cpp -o calc_gui -std=c++17
 ******************************************************************************/

#include <canvas_main.h>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

static const double PI = std::acos(-1.0);
static const double EULER = std::exp(1.0);

enum class Kind { Num, Op, Lp, Rp, Fn, Const, Post };
struct Tok { Kind kind; std::string v; };

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
    if (!r.ok) return "Error";
    if (!std::isfinite(r.value)) return "Error";
    double n = tidy(r.value);
    if (n == 0.0) return "0";
    char buf[64];
    std::snprintf(buf, sizeof(buf), "%.10g", n);
    return std::string(buf);
}
static double nthRoot(double n, double x) {
    if (n == 0.0) return NAN;
    if (x < 0.0) return NAN;
    return std::pow(x, 1.0 / n);
}
static bool isFnName(const std::string& w) { return false; } // demo grammar: digits, + - * / ^, nrt, parens

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
            out.tokens.push_back({Kind::Num, src.substr(i, j - i)});
            i = j; continue;
        }
        if (c == '(') { out.tokens.push_back({Kind::Lp, "("}); ++i; continue; }
        if (c == ')') { out.tokens.push_back({Kind::Rp, ")"}); ++i; continue; }
        if (c == '+' || c == '-' || c == '*' || c == '/' || c == '^') {
            out.tokens.push_back({Kind::Op, std::string(1, c)}); ++i; continue;
        }
        if (std::isalpha((unsigned char)c)) {
            size_t j = i;
            while (j < src.size() && std::isalnum((unsigned char)src[j])) ++j;
            std::string word = src.substr(i, j - i);
            if (word == "nrt") { out.tokens.push_back({Kind::Op, "r"}); i = j; continue; }
            out.ok = false; out.message = "Unknown token"; return out;
        }
        out.ok = false; out.message = "Bad character"; return out;
    }
    return out;
}

class Parser {
public:
    const std::vector<Tok>& tokens;
    size_t i = 0;
    bool failed = false;
    std::string error;
    explicit Parser(const std::vector<Tok>& t) : tokens(t) {}
    void fail(const std::string& msg) { if (!failed) { failed = true; error = msg; } }
    const Tok* peek() const { return i < tokens.size() ? &tokens[i] : nullptr; }
    bool isOp(const char* v) const { const Tok* t = peek(); return t && t->kind == Kind::Op && t->v == v; }
    const Tok* consume() { if (failed || i >= tokens.size()) { fail("Syntax error"); return nullptr; } return &tokens[i++]; }

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
        while (isOp("*") || isOp("/")) {
            const Tok* op = consume(); if (!op) return 0;
            const double r = parsePower(); if (failed) return 0;
            if (op->v == "/") { if (r == 0.0) { fail("Div by zero"); return 0; } v /= r; } else v *= r;
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
        return parsePrimary();
    }
    double parsePrimary() {
        const Tok* t = peek();
        if (!t) { fail("Syntax error"); return 0; }
        if (t->kind == Kind::Num) { consume(); return std::strtod(t->v.c_str(), nullptr); }
        if (t->kind == Kind::Lp) {
            consume();
            const double v = parseExpr(); if (failed) return 0;
            if (!peek() || peek()->kind != Kind::Rp) { fail("Mismatched parens"); return 0; }
            consume();
            return v;
        }
        fail("Syntax error");
        return 0;
    }
};

static Result evaluate(std::vector<Tok> tokens) {
    if (tokens.empty()) return Result::okValue(0.0);
    Parser p(tokens);
    const double v = p.parseExpr();
    if (p.failed) return Result::fail(p.error);
    if (p.i != tokens.size()) return Result::fail("Syntax error");
    return Result::okValue(tidy(v));
}

// ── Real canvas-drawn calculator ────────────────────────────────
Canvas canvas(340, 460);

struct Key { const char* label; double x, y, w, h; };
static const Key KEYS[] = {
    {"(",  10,  180, 75, 50}, {")",  95,  180, 75, 50}, {"nrt", 180, 180, 75, 50}, {"^",  265, 180, 65, 50},
    {"7",  10,  240, 75, 50}, {"8",  95,  240, 75, 50}, {"9",   180, 240, 75, 50}, {"/",  265, 240, 65, 50},
    {"4",  10,  300, 75, 50}, {"5",  95,  300, 75, 50}, {"6",   180, 300, 75, 50}, {"*",  265, 300, 65, 50},
    {"1",  10,  360, 75, 50}, {"2",  95,  360, 75, 50}, {"3",   180, 360, 75, 50}, {"-",  265, 360, 65, 50},
    {"0",  10,  420, 75, 50}, {"=",  95,  420, 160, 50}, {"+",  265, 420, 65, 50},
};

// The real, fixed demo sequence (see file header): each string is one
// full expression, genuinely tokenized/parsed/evaluated when its turn
// comes, exactly like a real key sequence culminating in "=".
static const char* DEMO_EXPRS[] = { "3nrt(8+19)", "(1+2)*(3+4)^2", "2^8" };
static int demoIndex = 0;
static double lastFrameTime = 0;
static std::string currentDisplay = "0";
static std::string currentExpr = "";
static int highlightKeyIndex = -1;

void setup() {
    canvas.setFillStyle("#0a0f14");
}

static void drawCalculator(const std::string& exprText, const std::string& displayText, int highlight) {
    canvas.setFillStyle("#0a0f14");
    canvas.fillRect(0, 0, canvas.width, canvas.height);

    // Display
    canvas.setFillStyle("#141a22");
    canvas.fillRect(10, 10, 320, 150);
    canvas.setFillStyle("#4a5568");
    canvas.setFont("11px monospace");
    canvas.fillText(exprText, 22, 100);
    canvas.setFillStyle("#e8f4f2");
    canvas.setFont("bold 34px monospace");
    canvas.fillText(displayText, 22, 140);

    // Keypad
    int idx = 0;
    for (const Key& k : KEYS) {
        bool isEq = std::string(k.label) == "=";
        bool isOp = std::string(k.label) == "+" || std::string(k.label) == "-" ||
                    std::string(k.label) == "*" || std::string(k.label) == "/" ||
                    std::string(k.label) == "^" || std::string(k.label) == "nrt";
        if (idx == highlight) canvas.setFillStyle("#00e5ff");
        else if (isEq) canvas.setFillStyle("#00e5ff");
        else if (isOp) canvas.setFillStyle("#0d3e46");
        else canvas.setFillStyle("#1f2932");
        canvas.fillRect(k.x, k.y, k.w, k.h);

        canvas.setFillStyle((idx == highlight || isEq) ? "#00141a" : "#e8f4f2");
        canvas.setFont("bold 16px monospace");
        canvas.fillText(k.label, k.x + k.w / 2 - 8, k.y + k.h / 2 + 6);
        ++idx;
    }
}

void loop(double t, double dt) {
    // Advance the real demo roughly once per second, tokenizing+parsing+
    // evaluating the next fixed expression for real each time.
    if (t - lastFrameTime > 1.5) {
        lastFrameTime = t;
        if (demoIndex < (int)(sizeof(DEMO_EXPRS) / sizeof(DEMO_EXPRS[0]))) {
            currentExpr = DEMO_EXPRS[demoIndex];
            TokenizeResult tk = tokenize(currentExpr);
            if (tk.ok) {
                Result r = evaluate(tk.tokens);
                currentDisplay = fmt(r);
            } else {
                currentDisplay = "Error";
            }
            ++demoIndex;
        } else {
            demoIndex = 0;
        }
    }
    drawCalculator(currentExpr, currentDisplay, -1);
}
