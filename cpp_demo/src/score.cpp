#include <cstdlib>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

struct Input {
  int holders = 0;
  bool lp_locked = false;
  double risk = 0.0;
};

static Input parse_args(int argc, char** argv) {
  Input in;
  for (int i = 1; i < argc; ++i) {
    std::string_view a(argv[i]);
    auto next = [&](int i) {
      return (i + 1 < argc) ? std::string_view(argv[i + 1]) : std::string_view{};
    };
    if (a == "--holders" && i + 1 < argc) {
      in.holders = std::atoi(argv[++i]);
      continue;
    }
    if (a == "--lp_locked" && i + 1 < argc) {
      auto v = next(i);
      ++i;
      in.lp_locked = (v == "1" || v == "true" || v == "yes" || v == "y");
      continue;
    }
    if (a == "--risk" && i + 1 < argc) {
      in.risk = std::atof(argv[++i]);
      continue;
    }
  }
  return in;
}

static double clamp(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

int main(int argc, char** argv) {
  Input in = parse_args(argc, argv);
  double h = in.holders <= 0 ? 0.0 : (in.holders >= 1000 ? 1.0 : in.holders / 1000.0);
  double score = h + (in.lp_locked ? 0.2 : 0.0) - in.risk;
  score = clamp(score, 0.0, 1.0);
  std::string reason = std::string("holders:") + std::to_string(in.holders) +
                       (in.lp_locked ? " lp_locked:yes" : " lp_locked:no") +
                       " risk:" + std::to_string(in.risk);
  std::cout << "{"
            << "\"ok\":true,"
            << "\"score\":" << score << ","
            << "\"reason\":\"" << reason << "\""
            << "}\n";
  return 0;
}
