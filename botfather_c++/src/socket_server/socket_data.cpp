#include "socket_data.h"
#include "util.h"
#include "ThreadPool.h"
#include "Worker.h"
#include "Redis.h"
#include <tbb/task_group.h>

static tbb::task_group task;

SocketData::SocketData(const int _BATCH_SIZE) : BATCH_SIZE(_BATCH_SIZE)
{
    timeframes = {"1m", "5m", "15m", "30m", "1h", "4h", "1d"};
}

void SocketData::init()
{
    symbolList = getSymbolList();

    {
        lock_guard<mutex> lock(mMutex);
        for (string &symbol : symbolList)
        {
            for (string &tf : timeframes)
            {
                string key = symbol + "_" + tf;
                data[key] = RateData();
                data[key].symbol = symbol;
                data[key].interval = tf;
            }
        }
    }
    connectSocket();
}

void SocketData::onCloseCandle(const string &symbol, string &timeframe, RateData &rateData)
{
    if (rateData.startTime.size() < 15)
        return;

    if (!botList)
        return;

    vector<double> open(rateData.open.begin(), rateData.open.end());
    vector<double> high(rateData.high.begin(), rateData.high.end());
    vector<double> low(rateData.low.begin(), rateData.low.end());
    vector<double> close(rateData.close.begin(), rateData.close.end());
    vector<double> volume(rateData.volume.begin(), rateData.volume.end());
    vector<long long> startTime(rateData.startTime.begin(), rateData.startTime.end());

    shared_ptr<Worker> worker = make_shared<Worker>(botList, broker, symbol, timeframe, move(open), move(high), move(low), move(close), move(volume), move(startTime));

    task.run([worker, this, timeframe]()
             { worker->run(); });

    this->updateCache(this->data[symbol + "_" + timeframe]);
}

void SocketData::mergeData(RateData &rateData, const string &symbol, string &timeframe, string &currentTF, double open, double high, double low, double close, double volume, long long startTime, bool isFinal, bool ignoreClose)
{
    if (timeframeToNumberMinutes(timeframe) % timeframeToNumberMinutes(currentTF) != 0)
    {
        return;
    }

    long long rateStartTime = getStartTime(timeframe, startTime);

    if (rateData.open.empty())
    {
        return;
    }

    if (rateData.startTime[0] == rateStartTime)
    {
        rateData.high[0] = max(rateData.high[0], high);
        rateData.low[0] = min(rateData.low[0], low);
        rateData.close[0] = close;
        rateData.volume[0] += isFinal ? volume : 0;

        if (!ignoreClose && isFinal && checkFinal(timeframe, startTime, currentTF))
        {
            onCloseCandle(symbol, timeframe, rateData);
        }
    }
    else if (rateStartTime > rateData.startTime[0])
    {
        // if (!ignoreClose)
        // {
        //     LOGI("Force final %s %s %s", symbol.c_str(), timeframe.c_str(), toTimeString(rateStartTime).c_str());
        //     onCloseCandle(symbol, timeframe, rateData);
        // }

        rateData.open.push_front(open);
        rateData.high.push_front(high);
        rateData.low.push_front(low);
        rateData.close.push_front(close);
        rateData.volume.push_front(volume);
        rateData.startTime.push_front(rateStartTime);

        adjustData(rateData);
    }
    else
    {
        LOGI("Merge data fail %s %s %s", symbol.c_str(), timeframe.c_str(), currentTF.c_str());
    }
}

void SocketData::adjustData(RateData &rateData)
{
    if (rateData.open.size() > MAX_CANDLE)
    {
        rateData.open.pop_back();
        rateData.high.pop_back();
        rateData.low.pop_back();
        rateData.close.pop_back();
        rateData.volume.pop_back();
        rateData.startTime.pop_back();
    }
}

void SocketData::updateCache(const RateData &rateData)
{
    if (rateData.interval == "1m" || rateData.startTime.empty())
    {
        return;
    }

    ThreadPool::getInstance().enqueue([this, &rateData]()
                                      {
        string symbol = rateData.symbol;
        string timeframe = rateData.interval;

        string key = broker + "_" + symbol + "_" + timeframe;

        int size = Redis::getInstance().size(key);
        if (size == 0)
        {
            vector<string> v;
            {
                lock_guard<mutex> lock(this->mMutex);
                for (int i = 1; i < rateData.startTime.size(); ++i)
                {
                    // item: startTime_open_high_low_close_volume
                    string item = to_string(rateData.startTime[i]) + "_" +
                                to_string(rateData.open[i]) + "_" +
                                to_string(rateData.high[i]) + "_" +
                                to_string(rateData.low[i]) + "_" +
                                to_string(rateData.close[i]) + "_" +
                                to_string(rateData.volume[i]);
                    v.push_back(item);
                }
            }
            
            if (!Redis::getInstance().pushBack(key, v))
            {
                LOGE("Failed to update cache for %s %s", symbol.c_str(), timeframe.c_str());
                return;
            };
            LOGD("Update cache %s %s %s - %d items",broker.c_str(), symbol.c_str(), timeframe.c_str(), (int)v.size());
        }
        else
        {
            vector<string> v;
            long long lastTime = stoll(split(Redis::getInstance().front(key), '_')[0]);
            {
                lock_guard<mutex> lock(this->mMutex);

                int i = 0;
                while (i < size && rateData.startTime[i] > lastTime)
                {
                    i++;
                }
                i--;
                while (i > 0)
                {
                    // item: startTime_open_high_low_close_volume
                    string item = to_string(rateData.startTime[i]) + "_" +
                                to_string(rateData.open[i]) + "_" +
                                to_string(rateData.high[i]) + "_" +
                                to_string(rateData.low[i]) + "_" +
                                to_string(rateData.close[i]) + "_" +
                                to_string(rateData.volume[i]);
                    v.push_back(item);
                    i--;
                }
            }
            
            if (!v.empty())
            {
                if (!Redis::getInstance().pushFront(key, v))
                {
                    LOGE("Failed to update cache for %s %s", symbol.c_str(), timeframe.c_str());
                    return;
                }
                LOGD("Update cache %s %s %s - %d items", broker.c_str(), symbol.c_str(), timeframe.c_str(), (int)v.size());
            }
        }
        while (Redis::getInstance().size(key) > MAX_CANDLE)
        {
            Redis::getInstance().popBack(key);
        } });
}

bool SocketData::isValidData(const RateData &rateData)
{
    int length = rateData.startTime.size();
    if (length <= 1)
    {
        return true;
    }
    long long timeIntervalMiliseconds = timeframeToNumberMiliseconds(rateData.interval);
    for (int i = 1; i < length; i++)
    {
        if (rateData.startTime[i - 1] - rateData.startTime[i] != timeIntervalMiliseconds)
        {
            return false;
        }
    }
    return true;
}

RateData SocketData::getOHLCVFromCache(const string &symbol, const string &timeframe)
{
    string key = broker + "_" + symbol + "_" + timeframe;
    vector<string> ohlcv = Redis::getInstance().getList(key);

    RateData rateData;
    rateData.symbol = symbol;
    rateData.interval = timeframe;

    for (const string &item : ohlcv)
    {
        // item: startTime_open_high_low_close_volume
        vector<string> parts = split(item, '_');
        if (parts.size() != 6)
        {
            LOGE("Invalid OHLCV data format: %s", item.c_str());
            break;
        }
        rateData.startTime.push_back(stoll(parts[0]));
        rateData.open.push_back(stod(parts[1]));
        rateData.high.push_back(stod(parts[2]));
        rateData.low.push_back(stod(parts[3]));
        rateData.close.push_back(stod(parts[4]));
        rateData.volume.push_back(stod(parts[5]));
    }

    LOGD("Get OHLCV from cache %s %s %s - %d items", broker.c_str(), symbol.c_str(), timeframe.c_str(), (int)rateData.startTime.size());
    return rateData;
}

shared_ptr<boost::asio::ssl::context> SocketData::on_tls_init(connection_hdl)
{
    auto ctx = make_shared<boost::asio::ssl::context>(boost::asio::ssl::context::tlsv12_client);
    ctx->set_default_verify_paths();
    return ctx;
}

void SocketData::onSocketConnected(connection_hdl hdl)
{
    LOGI("Socket %s connected", broker.c_str());

    thread t([this]()
             {
        for (int i = 0; i < symbolList.size(); i += BATCH_SIZE)
        {
            vector<future<int>> futures;
            int end = min(i + BATCH_SIZE, (int)symbolList.size());

            for (int j = i; j < end; ++j)
            {
                string symbol = symbolList[j];

                futures.emplace_back(async(launch::async, [this, symbol]()
                                                {
                    int cnt = 0;
                    for(int k=0; k<timeframes.size(); k++)
                    {
                        string tf = timeframes[k];
                        RateData rateData;
                        if(tf == "1m")
                        {
                            rateData = getOHLCV(symbol, tf, MAX_CANDLE);
                            cnt++;
                        }
                        else {
                            rateData = getOHLCVFromCache(symbol, tf);
                            if (rateData.startTime.empty()) {
                                rateData = getOHLCV(symbol, tf, MAX_CANDLE);
                                cnt++;
                                string key = broker + "_" + symbol + "_" + tf;
                                Redis::getInstance().clearList(key);
                            }
                            else{
                                for(int m = k-1; m >= 0; m--) {
                                    if(timeframeToNumberMinutes(tf) % timeframeToNumberMinutes(timeframes[m]) != 0){
                                        continue;
                                    }

                                    lock_guard<mutex> lock(mMutex);
                                    RateData &smaller = data[symbol + "_" + timeframes[m]];
                                    int size = smaller.startTime.size();
                                    int l = 0;
                                    while(l < size && smaller.startTime[l] >= rateData.startTime[0]) {
                                        l++;
                                    }
                                    l--;
                                    while(l >= 0){
                                        long long startTime = smaller.startTime[l];
                                        double open = smaller.open[l];
                                        double high = smaller.high[l];
                                        double low = smaller.low[l];
                                        double close = smaller.close[l];
                                        double volume = smaller.volume[l];
                                        mergeData(rateData, symbol, tf, timeframes[m], open, high, low, close, volume, startTime, l > 0, true);
                                        l--;
                                    }
                                }
                                adjustData(rateData);
                                if (!isValidData(rateData)) {
                                    LOGE("Invalid data for %s %s", symbol.c_str(), tf.c_str());
                                    rateData = getOHLCV(symbol, tf, MAX_CANDLE);
                                    cnt++;
                                    string key = broker + "_" + symbol + "_" + tf;
                                    Redis::getInstance().clearList(key);
                                }
                            }
                        }

                        
                        string key = symbol + "_" + tf;

                        {
                            lock_guard<mutex> lock(mMutex);
                            data[key] = rateData;
                            updateCache(data[key]);
                        }
                        
                    }
                    return cnt;
                 }));
            }

            // Chờ batch này xong
            int cnt = 0;
            for (auto &f : futures){
                try {
                    cnt += f.get();
                } 
                catch (const std::exception& e) {
                    std::cout << "Init data error: " << e.what() << "\n";
                }
            }
            
            LOGD("%s: Init %d / %d. Get from cache %d times", broker.c_str(), end, (int) symbolList.size(), cnt);

            SLEEP_FOR(cnt * 5000 / 100);
    } });

    t.detach();
}

void SocketData::setBotList(shared_ptr<vector<shared_ptr<Bot>>> botList)
{
    LOGD("%s: Set bot list with size: %d", broker.c_str(), (int)botList->size());
    this->botList = botList;
}