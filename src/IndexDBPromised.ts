function openDatabase(
    databaseName: string, 
    upgrades: ((db: IDBDatabase) => void)[]
): Promise<Database> {
    console.log('opening db');
    return new Promise((resolve,reject) => {
        const dbOpenRequest = window.indexedDB.open(databaseName,upgrades.length);
        dbOpenRequest.onerror = (e) => {
            console.log(`database error: ${(e.target as any).errorCode}`);
            reject(e);
        };

        dbOpenRequest.onupgradeneeded = e => {
            const {oldVersion,newVersion} = e;
            const db: IDBDatabase = (e.target as any).result;
            console.log(`upgrade needed ${oldVersion} -> ${newVersion}`,db);
            for(let upgrade of upgrades.slice(oldVersion)){
                upgrade(db);
            }
        };

        dbOpenRequest.onsuccess = e => {
            const db: IDBDatabase = (e.target as any).result;
            console.log('opened database',db);
            resolve(new Database(db));
        };
    });
}

class Database {
    constructor(private readonly db: IDBDatabase){ }
    public getStore<T>(name: string): ObjectStore<T>{
        const txn = this.db.transaction([name],'readwrite');
        return new ObjectStore(txn.objectStore(name));
    }
}

class ObjectStore<T> {
    constructor(private readonly store: IDBObjectStore){}
    add(newRecord: T): Promise<void> {
        return new Promise((resolve,reject) => {
            const request = this.store.add(newRecord);
            request.onerror = (e) => {
                reject(e);
            };
            request.onsuccess = () => {
                resolve();
            };
        });
    }
    put(updatedRecord: T): Promise<void> {
        return new Promise((resolve,reject) => {
            const request = this.store.put(updatedRecord);
            request.onerror = (e) => {
                reject(e);
            };
            request.onsuccess = () => {
                resolve();
            };
        });
    }
    getAll(): Promise<T[]> {
        return new Promise((resolve,reject) => {
            const request = this.store.getAll();
            request.onerror = (e) => {
                reject(e);
            };
            request.onsuccess = (e) => {
                const records: T[] = (e.target as any).result;
                resolve(records);
            };
        });
    }
}

export default {
    openDatabase
};