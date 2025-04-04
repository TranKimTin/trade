import { defineComponent, onMounted, ref, watch } from 'vue';
import * as axios from '../../axios/axios';
import { useRoute, useRouter } from 'vue-router';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import MultiSelect from 'primevue/multiselect';
import BalanceChart from "./BalanceChart.vue";
import { useConfirm } from "primevue/useconfirm";
import * as Toast from '../../toast/toast';
import Select from 'primevue/select';

interface Order {
    id: number,
    symbol: string,
    broker: string,
    timeframe: string,
    orderType: string,
    volume: number,
    stop: number,
    entry: number,
    tp: number,
    sl: number,
    profit: number,
    status: ORDER_STATUS,
    createdTime: string,
    expiredTime: string,
    timeStop: string,
    timeEntry: string,
    timeTP: string,
    timeSL: string,
    lastTimeUpdated: string
};

export enum ORDER_STATUS {
    OPENED = 'Mở lệnh',
    MATCH_STOP = 'Khớp stop',
    MATCH_ENTRY = 'Khớp entry',
    MATCH_TP = 'Khớp TP',
    MATCH_SL = 'Khớp SL',
    CANCELED = 'Đã hủy'
}

export interface PropData {
    timestamp: string,
    balance: number,
    balanceNoFee: number,
    equity: number
}

export default defineComponent({
    components: { DataTable, Column, MultiSelect, BalanceChart, Select },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const botName: string = route.params.botName as string;

        const r_orderList = ref<Array<Order>>([]);
        const r_gain = ref<number>(0);
        const r_loss = ref<number>(0);
        const r_unrealizedGain = ref<number>(0);
        const r_unrealizedLoss = ref<number>(0);
        const r_cntGain = ref<number>(0);
        const r_cntLoss = ref<number>(0);
        const r_cntOpening = ref<number>(0);
        const r_maxDD = ref<number>(0);
        const r_isLoading = ref<boolean>(true);
        const timeframes: Array<string> = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'];
        const r_timeframesSelected = ref<Array<string>>([...timeframes]);
        const brokers: Array<string> = ['binance', 'bybit', 'okx', 'binance_future', 'bybit_future'];
        const r_brokerSelected = ref<Array<string>>([...brokers]);
        const r_balanceData = ref<Array<PropData>>([]);

        const r_botNameList = ref<Array<string>>([]);
        const r_botName = ref<string>(botName);

        let firstLoad = true;

        const confirmation = useConfirm();

        let timeout = 0;
        function loadData(isDelay: boolean) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                r_isLoading.value = true;
                r_balanceData.value = [];
                const params = {
                    botName: route.params.botName,
                    filterBroker: r_brokerSelected.value.join(','),
                    filterTimeframe: r_timeframesSelected.value.join(',')
                };
                axios.get(`/getHistoryOrder`, params).then(async (result: Array<Order>) => {
                    let gain = 0;
                    let loss = 0;
                    let unrealizedGain = 0;
                    let unrealizedLoss = 0;
                    let cntGain = 0;
                    let cntLoss = 0;
                    let cntOpening = 0;
                    let maxProfit = 0;
                    let maxDD = 0;
                    let balanceData: Array<PropData> = [];
                    const feeRate = 0.05 / 100;
                    let feeGain = 0;
                    let feeLoss = 0;
                    let totalFee = 0;
                    const argsEquity: Array<{ timestamp: string, orderList: Array<{ symbol: string, broker: string, orderType: string, entry: number, volume: number }> }> = [];
                    let lastTimeUpdated: string = '';

                    let sortedData = [...result];
                    sortedData.sort((a, b) => {
                        let timeA = new Date(a.createdTime).getTime();
                        let timeB = new Date(a.createdTime).getTime();

                        if (a.timeTP) timeA = new Date(a.timeTP).getTime();
                        else if (a.timeSL) timeA = new Date(a.timeSL).getTime();

                        if (b.timeTP) timeB = new Date(b.timeTP).getTime();
                        else if (b.timeSL) timeB = new Date(b.timeSL).getTime();

                        return timeA - timeB;
                    });

                    let orderOpening: Array<Order | undefined> = [];

                    for (let i = 0; i < sortedData.length; i++) {
                        const order = sortedData[i];
                        if (order.status !== ORDER_STATUS.CANCELED) {
                            orderOpening.push(order);
                        }

                        if (lastTimeUpdated === '' || (order.lastTimeUpdated && order.timeEntry && new Date(lastTimeUpdated).getTime() < new Date(order.lastTimeUpdated).getTime()))
                            lastTimeUpdated = order.lastTimeUpdated;

                        let fee = 0;
                        if (order.status === ORDER_STATUS.MATCH_ENTRY) fee = feeRate * order.volume * order.entry;
                        else if (order.status === ORDER_STATUS.MATCH_TP) fee = feeRate * order.volume * (order.entry + order.tp);
                        else if (order.status === ORDER_STATUS.MATCH_SL) fee = feeRate * order.volume * (order.entry + order.sl);

                        totalFee += fee;

                        if (order.timeTP) {
                            gain += order.profit;
                            feeGain += fee;
                            cntGain++;
                            balanceData.push({ timestamp: order.timeTP, balance: gain + loss - totalFee, balanceNoFee: gain + loss, equity: 0 });

                            //equity 
                            const timeCurrent = new Date(order.timeTP).getTime();
                            argsEquity.push({ timestamp: order.timeTP, orderList: [] });
                            for (let j = 0; j < orderOpening.length; j++) {
                                const o = orderOpening[j];
                                if (o === undefined) continue;

                                const timeEntry = new Date(o.timeEntry).getTime();
                                const timeTP = new Date(o.timeTP).getTime();
                                const timeSL = new Date(o.timeSL).getTime();

                                if (o.timeEntry && timeEntry <= timeCurrent && ((!o.timeTP && !o.timeSL) || (o.timeTP && timeTP > timeCurrent) || (o.timeSL && timeSL > timeCurrent))) {
                                    const { symbol, broker, orderType, entry, volume } = o;
                                    argsEquity[argsEquity.length - 1].orderList.push({ symbol, broker, orderType, entry, volume });
                                }
                                else {
                                    orderOpening[j] = undefined;
                                }
                            }
                            orderOpening = orderOpening.filter(item => item !== undefined);
                        }
                        else if (order.timeSL) {
                            loss += order.profit;
                            feeLoss += fee;
                            cntLoss++;
                            balanceData.push({ timestamp: order.timeSL, balance: gain + loss - totalFee, balanceNoFee: gain + loss, equity: 0 });

                            //equity 
                            const timeCurrent = new Date(order.timeSL).getTime();
                            argsEquity.push({ timestamp: order.timeSL, orderList: [] });
                            for (let j = 0; j < orderOpening.length; j++) {
                                const o = orderOpening[j];
                                if (o === undefined) continue;

                                const timeEntry = new Date(o.timeEntry).getTime();
                                const timeTP = new Date(o.timeTP).getTime();
                                const timeSL = new Date(o.timeSL).getTime();

                                if (o.timeEntry && timeEntry <= timeCurrent && ((!o.timeTP && !o.timeSL) || (o.timeTP && timeTP > timeCurrent) || (o.timeSL && timeSL > timeCurrent))) {
                                    const { symbol, broker, orderType, entry, volume } = o;
                                    argsEquity[argsEquity.length - 1].orderList.push({ symbol, broker, orderType, entry, volume });
                                }
                            }
                            orderOpening = orderOpening.filter(item => item !== undefined);
                        }
                        else if (order.timeEntry && order.profit) {
                            cntOpening++;
                            if (order.profit > 0) {
                                unrealizedGain += order.profit;
                                feeGain += fee;
                            }
                            else {
                                unrealizedLoss += order.profit;
                                feeLoss += fee;
                            }
                        }
                        maxProfit = Math.max(maxProfit, gain + loss);
                        maxDD = Math.max(maxDD, maxProfit - (gain + loss));
                        if (order.profit) order.profit -= fee;
                    }

                    r_orderList.value = result;
                    r_gain.value = parseFloat((gain - feeGain).toFixed(2));
                    r_loss.value = parseFloat((loss - feeLoss).toFixed(2));
                    r_unrealizedGain.value = parseFloat(unrealizedGain.toFixed(2));
                    r_unrealizedLoss.value = parseFloat(unrealizedLoss.toFixed(2));
                    r_maxDD.value = parseFloat(maxDD.toFixed(2));
                    r_cntGain.value = cntGain;
                    r_cntLoss.value = cntLoss;
                    r_cntOpening.value = cntOpening;
                    r_isLoading.value = false;
                    r_balanceData.value = balanceData;
                    if (firstLoad) {
                        firstLoad = false;
                        const timeframeSelected = [...new Set(sortedData.map(order => order.timeframe))];
                        timeframeSelected.sort((a, b) => timeframes.indexOf(a) - timeframes.indexOf(b));
                        r_timeframesSelected.value = timeframeSelected;

                        const brokerSelected = [...new Set(sortedData.map(order => order.broker))];
                        brokerSelected.sort((a, b) => brokers.indexOf(a) - brokers.indexOf(b));
                        r_brokerSelected.value = brokerSelected;

                        watch(r_timeframesSelected, (newValue) => {
                            newValue.sort((a, b) => timeframes.indexOf(a) - timeframes.indexOf(b));
                            loadData(true);
                        });
                        watch(r_brokerSelected, (newValue) => {
                            newValue.sort((a, b) => brokers.indexOf(a) - brokers.indexOf(b));
                            loadData(true);
                        });
                        watch(r_botName, (newValue) => {
                            router.push(`/history/${r_botName.value}`);
                        });
                        watch(() => route.params.botName, (newValue) => {
                            loadData(false);
                        });
                    }

                    const step = Math.max(10, Math.ceil(argsEquity.length / 30));
                    for (let idx = 0; idx < argsEquity.length; idx += step) {
                        const newData = [...r_balanceData.value];

                        const args = argsEquity.slice(idx, idx + step);
                        const data = await axios.post('/getUnrealizedProfit', args);

                        if (data.length === args.length) {
                            for (let i = 0; i < data.length; i++) {
                                newData[idx + i].equity = data[i] + newData[idx + i].balance;
                            }
                            r_balanceData.value = newData;
                        }
                        else {
                            Toast.showError(`Update equity error ${idx}`);
                        }
                    }

                    const newData = [...r_balanceData.value];

                    if (lastTimeUpdated !== '' && newData.length > 0 && new Date(lastTimeUpdated).getTime() > new Date(newData[newData.length - 1].timestamp).getTime()) {
                        newData.push({
                            timestamp: lastTimeUpdated,
                            balance: gain + loss - feeGain - feeLoss,
                            balanceNoFee: gain + loss,
                            equity: gain + loss - feeGain - feeLoss + unrealizedGain + unrealizedLoss
                        });
                        r_balanceData.value = newData;
                    }

                });
            }, isDelay ? 3000 : 0);
        }

        function clearHistory() {
            confirmation.require({
                message: `Xác nhận xóa lịch sử bot ${botName}`,
                header: 'Xóa lịch sử',
                icon: 'pi pi-info-circle',
                rejectLabel: 'Cancel',
                rejectProps: {
                    label: 'Cancel',
                    severity: 'secondary',
                    outlined: true
                },
                acceptProps: {
                    label: 'Delete',
                    severity: 'danger'
                },
                accept: async () => {
                    try {
                        await axios.delete_('/clearHistory', { botName });
                        Toast.showWarning(`Xóa bot ${botName} thành công`);
                        setTimeout(() => {
                            window.location.reload();
                        }, 1000);
                    }
                    catch (err: any) {
                        Toast.showError(err.message);
                    }
                },
                reject: () => {
                }
            });
        }
        onMounted(() => {
            loadData(false);
            axios.get('/getBotList').then(result => {
                r_botNameList.value = result;
            });
        });

        return {
            botName,
            r_orderList,
            r_gain,
            r_loss,
            r_unrealizedGain,
            r_unrealizedLoss,
            r_cntGain,
            r_cntLoss,
            r_cntOpening,
            r_maxDD,
            r_isLoading,
            r_timeframesSelected,
            r_brokerSelected,
            r_balanceData,
            r_botNameList,
            r_botName,
            timeframes,
            brokers,
            clearHistory
        };
    }
});