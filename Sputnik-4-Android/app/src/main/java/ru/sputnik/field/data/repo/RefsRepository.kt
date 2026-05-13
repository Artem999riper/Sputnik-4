package ru.sputnik.field.data.repo

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import ru.sputnik.field.data.db.AppDatabase
import ru.sputnik.field.data.model.*

class RefsRepository(private val db: AppDatabase) {

    // ── Рабочие ─────────────────────────────────────────────────
    fun allWorkers(): Flow<List<Worker>> = db.workers().all()

    suspend fun workersByIds(ids: List<String>): List<Worker> = withContext(Dispatchers.IO) {
        db.workers().byIds(ids)
    }

    suspend fun insertAllWorkers(items: List<Worker>) = withContext(Dispatchers.IO) {
        db.workers().insertAll(items)
    }

    suspend fun clearWorkers() = withContext(Dispatchers.IO) { db.workers().clear() }

    // ── Транспорт ───────────────────────────────────────────────
    fun allTransport(): Flow<List<Transport>> = db.transport().all()

    suspend fun transportById(id: String): Transport? = withContext(Dispatchers.IO) {
        db.transport().byId(id)
    }

    suspend fun insertAllTransport(items: List<Transport>) = withContext(Dispatchers.IO) {
        db.transport().insertAll(items)
    }

    suspend fun clearTransport() = withContext(Dispatchers.IO) { db.transport().clear() }

    // ── Бригада ─────────────────────────────────────────────────
    suspend fun currentBrigade(): Brigade? = withContext(Dispatchers.IO) {
        db.brigades().current()
    }

    suspend fun insertBrigade(b: Brigade) = withContext(Dispatchers.IO) {
        db.brigades().insert(b)
    }

    suspend fun brigadeMembers(brigadeId: String): List<BrigadeMember> = withContext(Dispatchers.IO) {
        db.brigades().members(brigadeId)
    }

    suspend fun insertBrigadeMember(m: BrigadeMember) = withContext(Dispatchers.IO) {
        db.brigades().insertMember(m)
    }

    suspend fun clearBrigadeMembers(brigadeId: String) = withContext(Dispatchers.IO) {
        db.brigades().clearMembers(brigadeId)
    }

    // ── Пользовательские справочники ─────────────────────────────
    fun customSoilTypes(): Flow<List<String>> = db.customRefs().soilTypes()
    fun customSoilStates(): Flow<List<String>> = db.customRefs().soilStates()

    suspend fun addCustomSoilType(t: CustomSoilType) = withContext(Dispatchers.IO) {
        db.customRefs().addSoilType(t)
    }

    suspend fun addCustomSoilState(s: CustomSoilState) = withContext(Dispatchers.IO) {
        db.customRefs().addSoilState(s)
    }
}
