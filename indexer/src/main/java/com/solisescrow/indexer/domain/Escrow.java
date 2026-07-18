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
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "escrows")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Escrow {

    @Id
    @Column(name = "id", length = 56, nullable = false)
    private String id;

    @Column(name = "title", nullable = false, columnDefinition = "TEXT")
    private String title;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "creator_wallet", length = 56, nullable = false)
    private String creatorWallet;

    @Column(name = "target_amount", precision = 28, scale = 7, nullable = false)
    private BigDecimal targetAmount;

    @Column(name = "raised_amount", precision = 28, scale = 7, nullable = false)
    private BigDecimal raisedAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "asset", nullable = false)
    private AssetType asset = AssetType.XLM;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "status", nullable = false)
    private EscrowStatus status = EscrowStatus.ACTIVE;

    @Column(name = "deadline_at")
    private OffsetDateTime deadlineAt;

    @Column(name = "created_ledger")
    private Long createdLedger;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    // Bidirectional mapping to Pledge
    @OneToMany(mappedBy = "escrow", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Pledge> pledges = new ArrayList<>();
}
