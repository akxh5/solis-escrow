package com.solisescrow.indexer.repository;

import com.solisescrow.indexer.domain.IndexerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface IndexerStateRepository extends JpaRepository<IndexerState, Integer> {
    // Basic CRUD methods cover the singleton fetch requirements.
}
