/* eslint-disable */
import Vue from "vue";
import Vuex from "vuex";
import CreatePersistedState from "vuex-persistedstate";
import api from "./modules/vapi";
import main from "./modules/main"
import {ds, pf} from "./modules/searchSettings";
import {ds_cols, pf_cols} from "./modules/colSettings";

Vue.use(Vuex);

// noinspection JSUnresolvedVariable
const debug = process.env.NODE_ENV !== "production";

api.namespaced = true;

export default new Vuex.Store({
    plugins: [CreatePersistedState({
        reducer: (persistedState) => {
            const stateFilter = JSON.parse( JSON.stringify( persistedState ) );
            // Remove stuff we do not want to persist for any reason
            delete stateFilter.api['datasetsCsv']; // Data is usually too big and serialization fails
            return stateFilter
        }
    })],
    modules: {
        main: main,
        api: api,
        dss: ds, // dss for DataSets Settings
        pfs: pf, // pfs for PlatForms Settings
        dsc: ds_cols, //dsc for DataSet Columns
        pfc: pf_cols //pfc for PlatForms Columns
    },
    strict: debug
});
