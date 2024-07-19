import { MindMapGraphDataRecord } from "./MindMap";
import IDB from "./IndexDBPromised";

const dbUpgrades = [
    (db: IDBDatabase) => {
        const newObjectStore = db.createObjectStore("graph", { keyPath: "id" });
        console.log({newObjectStore});
    }
];

const openDatabase = () => IDB.openDatabase("ADHD", dbUpgrades).then(db => ({
    get graph(){ return db.getStore<MindMapGraphDataRecord>('graph'); }
}));

export default {
    openDatabase
}
