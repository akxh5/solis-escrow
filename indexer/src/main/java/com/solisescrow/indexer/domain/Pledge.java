package com.solisescrow.indexer.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "pledges")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Pledge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "escrow_id", nullable = false)
    private Escrow escrow;

    @Column(name = "backer_wallet", length = 56, nullable = false)
    private String backerWallet;

    @Column(name = "amount", precision = 28, scale = 7, nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "asset", nullable = false)
    private AssetType asset;

    @Column(name = "tx_hash", nullable = false, unique = true, columnDefinition = "TEXT")
    private String txHash;

    @Column(name = "ledger_sequence")
    private Long ledgerSequence;

    @CreationTimestamp
    @Column(name = "pledged_at", nullable = false, updatable = false)
    private OffsetDateTime pledgedAt;
}
