#pragma once

#include "common_type.h"

class SocketBinance
{
protected:
    string broker;
    unordered_map<string, RateData> data; // key = symbol + "_" + timeframe;
    vector<string> timeframes;
    vector<string> symbolList;
    WebSocket ws;
    const int BATCH_SIZE;
    std::mutex mMutex;
    shared_ptr<vector<shared_ptr<Bot>>> botList;

    void on_message(connection_hdl, message_ptr msg);

    shared_ptr<boost::asio::ssl::context> on_tls_init(connection_hdl);
    void onSocketConnected(connection_hdl hdl);

    RateData getOHLCV(const string &symbol, const string &timeframe, int limit, long long since = 0);
    RateData getOHLCVFromCache(const string &symbol, const string &timeframe);
    void updateCache(const RateData &rateData);
    vector<string> getSymbolList();
    void mergeData(RateData &rateData, const string &symbol, string &timeframe, string &currentTF, double open, double high, double low, double close, double volume, long long timestamp, bool isFinal, bool ignoreClose);
    void adjustData(RateData &rateData);
    bool isValidData(const RateData &rateData);
    void onCloseCandle(const string &symbol, string &timeframe, RateData &data);

public:
    SocketBinance(const int _BATCH_SIZE);
    void setBotList(shared_ptr<vector<shared_ptr<Bot>>> botList);
    void connectSocket();

};