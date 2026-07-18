package com.solisescrow.indexer.repository;

import com.solisescrow.indexer.domain.Pledge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PledgeRepository extends JpaRepository<Pledge, Long> {

    // Leverage idx_pledges_escrow_id
    List<Pledge> findByEscrowIdOrderByPledgedAtDesc(String escrowId);

    // Leverage idx_pledges_backer_wallet
    List<Pledge> findByBackerWalletOrderByPledgedAtDesc(String backerWallet);

    // Guard against duplicate processing by checking transaction hash
    Optional<Pledge> findByTxHash(String txHash);
}
