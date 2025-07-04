#pragma one
#include "common_type.h"

class Worker
{
private:
    string broker;
    string symbol;
    string timeframe;
    vector<double> open;
    vector<double> high;
    vector<double> low;
    vector<double> close;
    vector<double> volume;
    vector<long long> startTime;
    shared_ptr<vector<shared_ptr<Bot>>> botList;
    unordered_map<string, bool> visited;
    int precision;

    string calculateSub(string &expr);
    any calculate(string &expr);
    bool adjustParam(NodeData &data);

public:
    Worker(shared_ptr<vector<shared_ptr<Bot>>> botList, string broker, string symbol, string timeframe, vector<double> open, vector<double> high, vector<double> low, vector<double> close, vector<double> volume, vector<long long> startTime);
    void run();
    void dfs_handleLogic(Route &route, int botID);
    bool handleLogic(NodeData &node, int botID);
};