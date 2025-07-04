#include "common_type.h"

// string
string toLowerCase(string str);
bool endsWith(const std::string &str, const std::string &suffix);
bool checkFinal(const string &tf, long long startTime, string &currentTF);
long long getStartTime(const string &tf, long long currentTime);
int timeframeToNumberMinutes(const string &tf);
long long timeframeToNumberMiliseconds(const string &tf);
long long timeframeToNumberSeconds(const string &tf);
long long nextTime(long long timestamp, const string &timeframe);
string toTimeString(long long timestampMs);
map<string, string> readEnvFile();
vector<string> split(const string &s, char delimiter);
vector<string> convertJsonStringArrayToVector(string s);
string StringFormat(const char *format, ...);
string doubleToString(double value, int precision);