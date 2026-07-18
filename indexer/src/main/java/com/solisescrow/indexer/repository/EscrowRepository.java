package com.solisescrow.indexer.repository;

import com.solisescrow.indexer.domain.AssetType;
import com.solisescrow.indexer.domain.Escrow;
import com.solisescrow.indexer.domain.EscrowStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EscrowRepository extends JpaRepository<Escrow, String> {
    
    // Leverage composite index: idx_escrows_status_asset_raised
    List<Escrow> findByStatusAndAssetOrderByRaisedAmountDesc(EscrowStatus status, AssetType asset);

    // Leverage idx_escrows_status
    List<Escrow> findByStatusOrderByCreatedAtDesc(EscrowStatus status);

    // Leverage idx_escrows_asset
    List<Escrow> findByAssetOrderByCreatedAtDesc(AssetType asset);
    
    // Leverage idx_escrows_deadline
    List<Escrow> findByStatusAndDeadlineAtIsNotNullOrderByDeadlineAtAsc(EscrowStatus status);
}
