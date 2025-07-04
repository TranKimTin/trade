#include "util.h"
#include "fstream"

string toLowerCase(string str)
{
    for (auto &c : str)
    {
        c = tolower(c);
    }
    return str;
}

bool endsWith(const string &str, const string &suffix)
{
    if (suffix.size() > str.size())
        return false;
    return equal(suffix.rbegin(), suffix.rend(), str.rbegin());
}

bool checkFinal(const string &tf, long long startTime, string &currentTF)
{
    long long nextTime = startTime / 1000 + timeframeToNumberSeconds(currentTF);
    if (tf == "1m")
        return nextTime % 60 == 0;
    if (tf == "3m")
        return nextTime % 180 == 0;
    if (tf == "5m")
        return nextTime % 300 == 0;
    if (tf == "15m")
        return nextTime % 900 == 0;
    if (tf == "30m")
        return nextTime % 1800 == 0;
    if (tf == "1h")
        return nextTime % 3600 == 0;
    if (tf == "2h")
        return nextTime % 7200 == 0;
    if (tf == "4h")
        return nextTime % 14400 == 0;
    if (tf == "6h")
        return nextTime % 21600 == 0;
    if (tf == "8h")
        return nextTime % 28800 == 0;
    if (tf == "12h")
        return nextTime % 43200 == 0;
    if (tf == "1d")
        return nextTime % 86400 == 0;
    return false;
}

long long getStartTime(const string &tf, long long currentTime)
{
    if (tf == "1m")
        return currentTime - currentTime % 60000;
    if (tf == "3m")
        return currentTime - currentTime % 180000;
    if (tf == "5m")
        return currentTime - currentTime % 300000;
    if (tf == "15m")
        return currentTime - currentTime % 900000;
    if (tf == "30m")
        return currentTime - currentTime % 1800000;
    if (tf == "1h")
        return currentTime - currentTime % 3600000;
    if (tf == "2h")
        return currentTime - currentTime % 7200000;
    if (tf == "4h")
        return currentTime - currentTime % 14400000;
    if (tf == "6h")
        return currentTime - currentTime % 21600000;
    if (tf == "8h")
        return currentTime - currentTime % 28800000;
    if (tf == "12h")
        return currentTime - currentTime % 43200000;
    if (tf == "1d")
        return currentTime - currentTime % 86400000;
    return currentTime;
}

int timeframeToNumberMinutes(const string &tf)
{
    if (tf == "1m")
        return 1;
    if (tf == "3m")
        return 3;
    if (tf == "5m")
        return 5;
    if (tf == "15m")
        return 15;
    if (tf == "30m")
        return 30;
    if (tf == "1h")
        return 60;
    if (tf == "2h")
        return 120;
    if (tf == "4h")
        return 240;
    if (tf == "6h")
        return 360;
    if (tf == "8h")
        return 480;
    if (tf == "12h")
        return 720;
    if (tf == "1d")
        return 1440;
    return 1;
}

long long timeframeToNumberMiliseconds(const string &tf)
{
    return (long long)timeframeToNumberSeconds(tf) * 1000;
}

long long timeframeToNumberSeconds(const string &tf)
{
    return (long long)timeframeToNumberMinutes(tf) * 60;
}

long long nextTime(long long timestamp, const string &timeframe)
{
    long long startTime = getStartTime(timeframe, timestamp);
    long long offsetTime = timeframeToNumberMiliseconds(timeframe);
    return startTime + offsetTime;
}

string toTimeString(long long timestampMs)
{
    time_t timestampSec = timestampMs / 1000;
    tm tm;
    localtime_r(&timestampSec, &tm);

    ostringstream oss;
    oss << setfill('0')
        << setw(4) << (tm.tm_year + 1900) << "-"
        << setw(2) << (tm.tm_mon + 1) << "-"
        << setw(2) << tm.tm_mday << " "
        << setw(2) << tm.tm_hour << ":"
        << setw(2) << tm.tm_min;

    return oss.str();
}

map<string, string> readEnvFile()
{
    ifstream file(".env");
    map<string, string> envMap;
    string line;

    while (getline(file, line))
    {
        if (line.empty() || line[0] == '#')
            continue;

        size_t eqPos = line.find('=');
        if (eqPos == string::npos)
            continue;

        string key = line.substr(0, eqPos);
        string value = line.substr(eqPos + 1);

        key.erase(0, key.find_first_not_of(" \t\r\n"));
        key.erase(key.find_last_not_of(" \t\r\n") + 1);
        value.erase(0, value.find_first_not_of(" \t\r\n"));
        value.erase(value.find_last_not_of(" \t\r\n") + 1);

        envMap[key] = value;
    }

    return envMap;
}

vector<string> split(const string &s, char delimiter)
{
    vector<string> tokens;
    string token;
    istringstream tokenStream(s);

    while (getline(tokenStream, token, delimiter))
    {
        if (!token.empty())
        {
            tokens.push_back(token);
        }
    }

    return tokens;
}

vector<string> convertJsonStringArrayToVector(string s)
{
    vector<string> result;

    json j = json::parse(s);
    for (const auto &item : j)
    {
        if (item.is_string())
        {
            result.push_back(item.get<string>());
        }
        else
        {
            LOGE("Invalid item in JSON array: %s", item.dump().c_str());
        }
    }
    return result;
}

string StringFormat(const char* format, ...) {
    va_list args;
    va_start(args, format);

    // tạo buffer tạm lớn
    vector<char> buffer(1024);
    int needed = vsnprintf(buffer.data(), buffer.size(), format, args);
    va_end(args);

    if (needed < 0) return "";

    if (static_cast<size_t>(needed) < buffer.size()) {
        return string(buffer.data());
    } else {
        // nếu buffer chưa đủ lớn, cấp lại
        buffer.resize(needed + 1);
        va_start(args, format);
        vsnprintf(buffer.data(), buffer.size(), format, args);
        va_end(args);
        return string(buffer.data());
    }
}

string doubleToString(double value, int precision) {
    ostringstream oss;
    oss << fixed << setprecision(precision) << value;
    return oss.str();
}